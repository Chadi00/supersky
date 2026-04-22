import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "../../vendor/pi-agent-core/index.js";
import type { Static } from "../../vendor/pi-ai/index.js";
import { Type } from "../../vendor/pi-ai/index.js";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type TruncationResult,
	truncateTail,
} from "./truncate";
import type { SuperskyToolDefinition } from "./types";

const schema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	timeout: Type.Optional(
		Type.Number({
			description: "Timeout in seconds (optional, no default timeout)",
		}),
	),
});

export type BashToolInput = Static<typeof schema>;

export interface BashToolDetails {
	command: string;
	exitCode: number | null;
	fullOutputPath?: string;
	truncation?: TruncationResult;
}

function tempFilePath() {
	return join(tmpdir(), `supersky-bash-${randomBytes(8).toString("hex")}.log`);
}

function getShell() {
	return process.env.SHELL || "/bin/zsh";
}

function createPartialResult(
	command: string,
	output: string,
): AgentToolResult<BashToolDetails> {
	const truncation = truncateTail(output, {
		maxLines: Math.min(50, DEFAULT_MAX_LINES),
		maxBytes: DEFAULT_MAX_BYTES,
	});
	return {
		content: [{ type: "text", text: truncation.content }],
		details: {
			command,
			exitCode: null,
			truncation,
		},
	};
}

export function createBashTool(
	cwd: string,
): SuperskyToolDefinition<typeof schema, BashToolDetails> {
	return {
		name: "bash",
		label: "bash",
		icon: "$",
		description:
			"Execute a shell command in the current working directory. Output is streamed while the command runs and truncated to the final 2000 lines or 50KB.",
		promptSnippet: "Run shell commands",
		promptGuidelines: [
			"Use bash when you need to inspect the repo, run builds, or execute tests.",
		],
		parameters: schema,
		formatCall(args) {
			return `$ ${args.command}`;
		},
		async execute(_toolCallId, args, signal, onUpdate) {
			const fullOutputPath = tempFilePath();
			const outputStream = createWriteStream(fullOutputPath);

			return new Promise((resolve, reject) => {
				let output = "";
				let finished = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				const shell = spawn(getShell(), ["-lc", args.command], {
					cwd,
					env: process.env,
					stdio: ["ignore", "pipe", "pipe"],
				});

				const cleanup = () => {
					if (timeoutHandle) {
						clearTimeout(timeoutHandle);
					}
					signal?.removeEventListener("abort", onAbort);
					outputStream.end();
				};

				const finish = (result: AgentToolResult<BashToolDetails>) => {
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
					fail(new Error("Operation aborted"));
				};

				if (signal?.aborted) {
					onAbort();
					return;
				}
				signal?.addEventListener("abort", onAbort, { once: true });

				if (args.timeout && args.timeout > 0) {
					timeoutHandle = setTimeout(() => {
						shell.kill("SIGTERM");
						fail(new Error(`Command timed out after ${args.timeout} seconds`));
					}, args.timeout * 1000);
				}

				const onData = (chunk: Buffer) => {
					const text = chunk.toString("utf8");
					output += text;
					outputStream.write(chunk);
					onUpdate?.(createPartialResult(args.command, output));
				};

				shell.stdout?.on("data", onData);
				shell.stderr?.on("data", onData);
				shell.on("error", (error) =>
					fail(error instanceof Error ? error : new Error(String(error))),
				);
				shell.on("close", (code) => {
					if (code !== 0) {
						const truncated = truncateTail(output, {
							maxLines: DEFAULT_MAX_LINES,
							maxBytes: DEFAULT_MAX_BYTES,
						});
						fail(
							new Error(
								`Command exited with code ${code}${truncated.content ? `\n\n${truncated.content}` : ""}`,
							),
						);
						return;
					}
					const truncation = truncateTail(output, {
						maxLines: DEFAULT_MAX_LINES,
						maxBytes: DEFAULT_MAX_BYTES,
					});
					finish({
						content: [{ type: "text", text: truncation.content }],
						details: {
							command: args.command,
							exitCode: code,
							fullOutputPath: truncation.truncated ? fullOutputPath : undefined,
							truncation,
						},
					});
				});
			});
		},
	};
}
