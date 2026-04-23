import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliRenderer } from "@opentui/core";

export type EditorPreset = "system" | "vscode" | "zed" | "vim" | "custom";

export type EditorOption = {
	id: EditorPreset;
	label: string;
	description: string;
	meta?: string;
};

type LaunchOptions = {
	preset: EditorPreset;
	customCommand?: string;
	workspaceRoot: string;
	renderer?: CliRenderer;
};

type LaunchPlan = {
	kind: "argv" | "shell";
	interactive: boolean;
	command: string[];
	description: string;
};

function hasMacApplication(name: string) {
	if (process.platform !== "darwin") {
		return false;
	}

	const candidates = [
		join("/Applications", `${name}.app`),
		join(homedir(), "Applications", `${name}.app`),
		join("/System/Applications", `${name}.app`),
	];

	return candidates.some((candidate) => existsSync(candidate));
}

function isPresetAvailable(preset: Exclude<EditorPreset, "system" | "custom">) {
	switch (preset) {
		case "vscode":
			return (
				Boolean(Bun.which("code")) || hasMacApplication("Visual Studio Code")
			);
		case "zed":
			return Boolean(Bun.which("zed")) || hasMacApplication("Zed");
		case "vim":
			return Boolean(Bun.which("vim"));
	}
}

function shellEscape(value: string) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function suspendRenderer<T>(
	renderer: CliRenderer | undefined,
	run: () => Promise<T>,
) {
	if (!renderer) {
		return run();
	}

	renderer.suspend();
	renderer.currentRenderBuffer.clear();
	try {
		return await run();
	} finally {
		renderer.currentRenderBuffer.clear();
		renderer.resume();
		renderer.requestRender();
	}
}

function getPlatformOpener(): string[] {
	if (process.platform === "darwin") {
		return ["open"];
	}
	if (process.platform === "win32") {
		return ["cmd", "/c", "start", ""];
	}
	return ["xdg-open"];
}

function getShell(): string[] {
	if (process.platform === "win32") {
		return ["powershell.exe", "-NoProfile", "-Command"];
	}
	return [process.env.SHELL || "sh", "-lc"];
}

function buildCustomCommand(command: string, workspaceRoot: string) {
	const quotedPath = shellEscape(workspaceRoot);
	return command.includes("{path}")
		? command.replaceAll("{path}", quotedPath)
		: `${command} ${quotedPath}`;
}

function resolveLaunchPlan(options: LaunchOptions): LaunchPlan | null {
	switch (options.preset) {
		case "system":
			return {
				kind: "argv",
				interactive: false,
				command: [...getPlatformOpener(), options.workspaceRoot],
				description: "system default editor",
			};
		case "vscode":
			if (Bun.which("code")) {
				return {
					kind: "argv",
					interactive: false,
					command: ["code", options.workspaceRoot],
					description: "VS Code",
				};
			}
			if (hasMacApplication("Visual Studio Code")) {
				return {
					kind: "argv",
					interactive: false,
					command: ["open", "-a", "Visual Studio Code", options.workspaceRoot],
					description: "VS Code",
				};
			}
			return null;
		case "zed":
			if (Bun.which("zed")) {
				return {
					kind: "argv",
					interactive: false,
					command: ["zed", options.workspaceRoot],
					description: "Zed",
				};
			}
			if (hasMacApplication("Zed")) {
				return {
					kind: "argv",
					interactive: false,
					command: ["open", "-a", "Zed", options.workspaceRoot],
					description: "Zed",
				};
			}
			return null;
		case "vim":
			if (!Bun.which("vim")) {
				return null;
			}
			return {
				kind: "argv",
				interactive: true,
				command: ["vim", options.workspaceRoot],
				description: "Vim",
			};
		case "custom": {
			const customCommand = options.customCommand?.trim();
			if (!customCommand) {
				return null;
			}
			return {
				kind: "shell",
				interactive: true,
				command: [
					...getShell(),
					buildCustomCommand(customCommand, options.workspaceRoot),
				],
				description: "custom editor command",
			};
		}
	}
}

export function getAvailableEditorOptions(
	selectedPreset: EditorPreset | undefined,
	customCommand?: string,
): EditorOption[] {
	const options: EditorOption[] = [
		{
			id: "system",
			label: "System default",
			description: "Open the project with the system default app.",
		},
	];

	if (isPresetAvailable("vscode")) {
		options.push({
			id: "vscode",
			label: "VS Code",
			description: "Open the project in Visual Studio Code.",
		});
	}

	if (isPresetAvailable("zed")) {
		options.push({
			id: "zed",
			label: "Zed",
			description: "Open the project in Zed.",
		});
	}

	if (isPresetAvailable("vim")) {
		options.push({
			id: "vim",
			label: "Vim",
			description: "Open the project directory in Vim.",
		});
	}

	options.push({
		id: "custom",
		label: "Custom command",
		description:
			"Run your own shell command. Use {path} for the workspace path.",
		meta:
			selectedPreset === "custom" && customCommand?.trim()
				? customCommand.trim()
				: undefined,
	});

	return options;
}

export async function launchWorkspaceInEditor(options: LaunchOptions) {
	const plan = resolveLaunchPlan(options);
	if (!plan) {
		return {
			ok: false,
			error:
				options.preset === "custom"
					? "No custom editor command configured."
					: `The configured editor (${options.preset}) is not available on this system.`,
		} as const;
	}

	const runCommand = async () => {
		const process = Bun.spawn(plan.command, {
			stdin: plan.interactive ? "inherit" : "ignore",
			stdout: plan.interactive ? "inherit" : "ignore",
			stderr: plan.interactive ? "inherit" : "pipe",
		});
		const exitCode = await process.exited;

		if (exitCode !== 0) {
			const stderr = process.stderr
				? Buffer.from(await new Response(process.stderr).arrayBuffer())
						.toString("utf8")
						.trim()
				: "";
			return {
				ok: false,
				error: stderr || `Failed to launch ${plan.description}.`,
			} as const;
		}

		return {
			ok: true,
			description: plan.description,
		} as const;
	};

	return plan.interactive
		? suspendRenderer(options.renderer, runCommand)
		: runCommand();
}
