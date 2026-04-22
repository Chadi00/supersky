import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateTail,
} from "./tools/truncate";

export type UserShellResult = {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
};

function getShell() {
	return process.env.SHELL || "/bin/zsh";
}

function tempFilePath() {
	return join(
		tmpdir(),
		`supersky-user-shell-${randomBytes(8).toString("hex")}.log`,
	);
}

export function executeUserShellCommand(
	cwd: string,
	command: string,
	signal?: AbortSignal,
): Promise<UserShellResult> {
	const fullOutputPath = tempFilePath();
	const outputStream = createWriteStream(fullOutputPath);

	return new Promise((resolve, reject) => {
		let output = "";
		let finished = false;

		const shell = spawn(getShell(), ["-lc", command], {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
			outputStream.end();
		};

		const finish = (result: UserShellResult) => {
			if (finished) {
				return;
			}
			finished = true;
			cleanup();
			resolve(result);
		};

		const fail = (error: Error) => {
			if (finished) {
				return;
			}
			finished = true;
			cleanup();
			reject(error);
		};

		const onAbort = () => {
			shell.kill("SIGTERM");
			const truncation = truncateTail(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});
			finish({
				output: truncation.content,
				exitCode: undefined,
				cancelled: true,
				truncated: truncation.truncated,
				fullOutputPath: truncation.truncated ? fullOutputPath : undefined,
			});
		};

		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });

		const onData = (chunk: Buffer) => {
			output += chunk.toString("utf8");
			outputStream.write(chunk);
		};

		shell.stdout?.on("data", onData);
		shell.stderr?.on("data", onData);
		shell.on("error", (error) =>
			fail(error instanceof Error ? error : new Error(String(error))),
		);
		shell.on("close", (code) => {
			const truncation = truncateTail(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});
			finish({
				output: truncation.content,
				exitCode: code ?? undefined,
				cancelled: false,
				truncated: truncation.truncated,
				fullOutputPath: truncation.truncated ? fullOutputPath : undefined,
			});
		});
	});
}
