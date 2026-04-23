import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntimeLike } from "./agent/runtime";
import * as userShell from "./agent/userShell";
import * as clipboard from "./app/clipboard";
import * as editorApp from "./app/editor";
import { getCommandPickerRowId } from "./session/commandPicker";
import * as compaction from "./session/compaction";
import { SIDEBAR_LAYOUT_WIDTH } from "./session/layout";
import { getUserMessageRowId } from "./session/MessageList";
import * as browser from "./session/providerState/browser";
import type { SessionServices } from "./session/providerState/services";
import { appLifecycle } from "./shared/lifecycle";
import {
	areScrollbarsHidden,
	captureRenderableGeometryByConstructorName,
	captureRenderableGeometryById,
	captureShellGeometry,
	clickFirstScrollBox,
	clickRenderable,
	findRenderableByConstructorName,
	findScrollbox,
	getComposerText,
	isSidebarVisible,
	moveMouseToRenderable,
	pressCtrlC,
	pressCtrlD,
	pressCtrlK,
	pressCtrlN,
	pressDown,
	pressEnter,
	pressEscape,
	pressLinefeed,
	pressTab,
	pressUp,
	sendMessages,
	settleScrollLayout,
	submitText,
	typeText,
	withApp,
} from "./test/appTestUtils";
import { createFakeSessionServices } from "./test/fakeSessionServices";
import type { AgentMessage } from "./vendor/pi-agent-core/index.js";

function createDelayedRuntime(sessionId: string): AgentRuntimeLike {
	let resolvePrompt: (() => void) | null = null;
	const state = {
		model: null as unknown,
		messages: [] as AgentMessage[],
		streamingMessage: null,
		isStreaming: false,
		errorMessage: null as string | null,
	};

	return {
		agent: { state } as unknown as AgentRuntimeLike["agent"],
		sessionId,
		cwd: process.cwd(),
		toolDefinitions: {} as AgentRuntimeLike["toolDefinitions"],
		setModel(model) {
			state.model = model as unknown;
		},
		setThinkingLevel() {},
		reset() {
			state.messages = [];
			state.streamingMessage = null;
			state.isStreaming = false;
			state.errorMessage = null;
		},
		prompt() {
			return new Promise<void>((resolve) => {
				resolvePrompt = () => {
					state.isStreaming = false;
					resolve();
				};
			});
		},
		abort() {
			resolvePrompt?.();
			resolvePrompt = null;
		},
		subscribe() {
			return () => {};
		},
	};
}

function slashCommandRowId(commandName: string) {
	return `slash-command-item-${commandName}`;
}

function createStoredSessionMessages(text: string): AgentMessage[] {
	return [
		{
			role: "user",
			content: [{ type: "text", text }],
			timestamp: 1,
		},
	];
}

function expectRowsLeftAligned(root: unknown, ...rowIds: string[]) {
	const positions = rowIds.map(
		(rowId) => captureRenderableGeometryById(root, rowId).x,
	);

	expect(new Set(positions).size).toBe(1);
}

function getCurrentSessionId(
	services: ReturnType<typeof createFakeSessionServices>,
) {
	return services.sessionStore.listSessions()[0]?.id ?? null;
}

let openUrlSpy: ReturnType<typeof spyOn<typeof browser, "openUrlInBrowser">>;
let copyToClipboardSpy: ReturnType<
	typeof spyOn<typeof clipboard, "copyToClipboard">
>;
let launchEditorSpy: ReturnType<
	typeof spyOn<typeof editorApp, "launchWorkspaceInEditor">
>;

beforeEach(() => {
	// Auth tests trigger browser-launch callbacks; stub them so the suite never
	// leaves real browser windows behind.
	openUrlSpy = spyOn(browser, "openUrlInBrowser").mockImplementation(() => {});
	copyToClipboardSpy = spyOn(clipboard, "copyToClipboard").mockResolvedValue();
	launchEditorSpy = spyOn(
		editorApp,
		"launchWorkspaceInEditor",
	).mockResolvedValue({ ok: true, description: "system default editor" });
});

afterEach(() => {
	openUrlSpy.mockRestore();
	copyToClipboardSpy.mockRestore();
	launchEditorSpy.mockRestore();
});

test("renders the supersky TUI shell (new session)", async () => {
	await withApp((setup) => {
		const frame = setup.captureCharFrame();
		const banner = findRenderableByConstructorName(
			setup.renderer.root,
			"ASCIIFontRenderable",
		);

		expect(banner).not.toBeNull();
		expect(frame).not.toContain("___ _ _ _ __ ___ _ __ ___| | ___ _");
		expect(frame).toContain("No model");
	});
});

test("renders the provided project line in the footer", async () => {
	await withApp(
		(setup) => {
			const frame = setup.captureCharFrame();

			expect(frame).toContain("~/projects/demo:feature/footer");
		},
		{ width: 110, height: 30 },
		"~/projects/demo:feature/footer",
	);
});

test("preserves rapid composer typing without resetting the draft", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "fast typing should stay stable");

		const frame = setup.captureCharFrame();

		expect(frame).toContain("fast typing should stay stable");
	});
});

test("clicking the message list keeps keyboard input in the composer", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);

		await clickFirstScrollBox(setup);
		await typeText(setup, "typed after click");

		expect(getComposerText(setup)).toContain("typed after click");
	});
});

test("submits the composer with enter", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "send on enter");

		const frame = setup.captureCharFrame();
		const occurrences = frame.match(/send on enter/g)?.length ?? 0;
		const timestampMatch = frame.match(/\b\d{1,2}:\d{2}:\d{2} (AM|PM)\b/);

		expect(frame).toContain("Handled request.");
		expect(frame).toContain("send on enter");
		expect(occurrences).toBe(1);
		expect(timestampMatch).not.toBeNull();
	});
});

test("clicking a committed user message opens the message actions dialog", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);
			await settleScrollLayout(setup);

			const sessionId = getCurrentSessionId(sharedServices);
			const message = sharedServices.sessionStore.getSession(sessionId ?? "")
				?.messages[0];
			expect(message?.role).toBe("user");

			await clickRenderable(
				setup,
				getUserMessageRowId(message as Extract<AgentMessage, { role: "user" }>),
			);
			await settleScrollLayout(setup);

			const frame = setup.captureCharFrame();
			expect(frame).toContain("Actions");
			expect(frame).toContain("Revert");
			expect(frame).toContain("Copy");
			expect(frame).toContain("Fork");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("the message actions dialog can copy a user message", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);
			await settleScrollLayout(setup);

			const sessionId = getCurrentSessionId(sharedServices);
			const message = sharedServices.sessionStore.getSession(sessionId ?? "")
				?.messages[0];
			expect(message?.role).toBe("user");

			await clickRenderable(
				setup,
				getUserMessageRowId(message as Extract<AgentMessage, { role: "user" }>),
			);
			await settleScrollLayout(setup);
			await clickRenderable(setup, "message-action-copy");
			await settleScrollLayout(setup);

			expect(copyToClipboardSpy).toHaveBeenCalledWith("message 0");
			expect(setup.captureCharFrame()).toContain(
				"Message copied to clipboard.",
			);
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("forking from a message keeps the current workspace files intact", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-fork-workspace-"),
	);
	const snapshotsDir = await mkdtemp(
		join(tmpdir(), "supersky-fork-snapshots-"),
	);
	const filePath = join(workspaceRoot, "note.txt");
	await writeFile(filePath, "base\n", "utf8");
	const sharedServices = createFakeSessionServices({
		workspaceRoot,
		snapshotsDir,
	});

	try {
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);

				const originalSessionId = getCurrentSessionId(sharedServices);
				const message = sharedServices.sessionStore.getSession(
					originalSessionId ?? "",
				)?.messages[0];
				expect(message?.role).toBe("user");

				await writeFile(filePath, "changed\n", "utf8");

				await clickRenderable(
					setup,
					getUserMessageRowId(
						message as Extract<AgentMessage, { role: "user" }>,
					),
				);
				await settleScrollLayout(setup);
				await clickRenderable(setup, "message-action-fork");
				await settleScrollLayout(setup);

				expect(sharedServices.sessionStore.listSessions()).toHaveLength(2);
				expect(await readFile(filePath, "utf8")).toBe("changed\n");
				expect(getComposerText(setup)).toContain("message 0");
				expect(
					sharedServices.sessionStore.getSession(originalSessionId ?? "")
						?.messages,
				).toHaveLength(2);
				const forkedSessionId = getCurrentSessionId(sharedServices);
				expect(forkedSessionId).not.toBe(originalSessionId);
				expect(
					sharedServices.sessionStore.getSession(forkedSessionId ?? "")
						?.messages,
				).toEqual([]);
			},
			{ width: 110, height: 30 },
			"~/projects/supersky:main",
			sharedServices,
		);
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(snapshotsDir, { recursive: true, force: true });
	}
});

test("submitting /fork branches from the latest user message", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await sendMessages(setup, 2);
			await settleScrollLayout(setup);

			const originalSessionId = getCurrentSessionId(sharedServices);
			const originalMessages = [
				...(sharedServices.sessionStore.getSession(originalSessionId ?? "")
					?.messages ?? []),
			];
			expect(originalMessages).toHaveLength(4);

			await submitText(setup, "/fork");
			await settleScrollLayout(setup);

			expect(sharedServices.sessionStore.listSessions()).toHaveLength(2);
			expect(getComposerText(setup)).toContain("message 1");
			expect(
				sharedServices.sessionStore.getSession(originalSessionId ?? "")
					?.messages,
			).toEqual(originalMessages);

			const forkedSessionId = getCurrentSessionId(sharedServices);
			expect(forkedSessionId).not.toBe(originalSessionId);
			expect(
				sharedServices.sessionStore.getSession(forkedSessionId ?? "")?.messages,
			).toEqual(originalMessages.slice(0, 2));
			expect(
				sharedServices.sessionStore.getSession(forkedSessionId ?? "")
					?.parentSessionId,
			).toBe(originalSessionId);
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("reverting from a message restores session file changes and shows a redo banner", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-revert-workspace-"),
	);
	const snapshotsDir = await mkdtemp(
		join(tmpdir(), "supersky-revert-snapshots-"),
	);
	const filePath = join(workspaceRoot, "note.txt");
	const executeUserShellCommandSpy = spyOn(
		userShell,
		"executeUserShellCommand",
	).mockImplementation(async () => {
		await writeFile(filePath, "changed\n", "utf8");
		return {
			output: "changed\n",
			exitCode: 0,
			cancelled: false,
			truncated: false,
		};
	});
	await writeFile(filePath, "base\n", "utf8");
	const sharedServices = createFakeSessionServices({
		workspaceRoot,
		snapshotsDir,
	});

	try {
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);
				await submitText(setup, "!mock-change-note");
				await settleScrollLayout(setup);

				const sessionId = getCurrentSessionId(sharedServices);
				const message = sharedServices.sessionStore.getSession(sessionId ?? "")
					?.messages[0];
				expect(message?.role).toBe("user");
				expect(setup.captureCharFrame()).toContain("changed");
				expect(await readFile(filePath, "utf8")).toBe("changed\n");

				await clickRenderable(
					setup,
					getUserMessageRowId(
						message as Extract<AgentMessage, { role: "user" }>,
					),
				);
				await settleScrollLayout(setup);
				await clickRenderable(setup, "message-action-revert");
				await settleScrollLayout(setup);

				expect(await readFile(filePath, "utf8")).toBe("base\n");
				expect(getComposerText(setup)).toContain("message 0");
				const frame = setup.captureCharFrame();
				expect(frame).toContain("1 message reverted");
				expect(frame).toContain("Redo");
			},
			{ width: 110, height: 30 },
			"~/projects/supersky:main",
			sharedServices,
		);
	} finally {
		executeUserShellCommandSpy.mockRestore();
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(snapshotsDir, { recursive: true, force: true });
	}
});

test("redo restores reverted messages and file changes", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-redo-workspace-"),
	);
	const snapshotsDir = await mkdtemp(
		join(tmpdir(), "supersky-redo-snapshots-"),
	);
	const filePath = join(workspaceRoot, "note.txt");
	const executeUserShellCommandSpy = spyOn(
		userShell,
		"executeUserShellCommand",
	).mockImplementation(async () => {
		await writeFile(filePath, "changed\n", "utf8");
		return {
			output: "changed\n",
			exitCode: 0,
			cancelled: false,
			truncated: false,
		};
	});
	await writeFile(filePath, "base\n", "utf8");
	const sharedServices = createFakeSessionServices({
		workspaceRoot,
		snapshotsDir,
	});

	try {
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);
				await submitText(setup, "!mock-change-note");
				await settleScrollLayout(setup);

				const sessionId = getCurrentSessionId(sharedServices);
				const message = sharedServices.sessionStore.getSession(sessionId ?? "")
					?.messages[0];
				expect(message?.role).toBe("user");

				await clickRenderable(
					setup,
					getUserMessageRowId(
						message as Extract<AgentMessage, { role: "user" }>,
					),
				);
				await settleScrollLayout(setup);
				await clickRenderable(setup, "message-action-revert");
				await settleScrollLayout(setup);

				expect(await readFile(filePath, "utf8")).toBe("base\n");

				await clickRenderable(setup, "session-revert-redo");
				await settleScrollLayout(setup);

				expect(await readFile(filePath, "utf8")).toBe("changed\n");
				expect(setup.captureCharFrame()).not.toContain("message reverted");
			},
			{ width: 110, height: 30 },
			"~/projects/supersky:main",
			sharedServices,
		);
	} finally {
		executeUserShellCommandSpy.mockRestore();
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(snapshotsDir, { recursive: true, force: true });
	}
});

test("typing slash opens the command menu", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("/login");
		expect(frame).toContain("/logout");
		expect(frame).toContain("/fork");
		expect(frame).toContain("/model");
		expect(frame).toContain("/settings");
		expect(frame).toContain("/new");
		expect(frame).toContain("/export");
		expect(frame).toContain("/copy");
		expect(frame).not.toContain("/delete");
	});
});

test("submitting from the welcome screen switches to the session view immediately", async () => {
	const services: SessionServices = {
		...createFakeSessionServices(),
		createRuntime: (_model, options) =>
			createDelayedRuntime(options?.sessionId ?? "delayed-session"),
	};

	await withApp(
		async (setup) => {
			await submitText(setup, "hello from welcome");

			const banner = findRenderableByConstructorName(
				setup.renderer.root,
				"ASCIIFontRenderable",
			);

			expect(banner).toBeNull();
			expect(getComposerText(setup)).toBe("");
			const frame = setup.captureCharFrame();

			expect(frame).toContain("hello from welcome");
			expect(frame).toContain("Working...");
			expect(frame).toContain("⢀⠀ ~/projects/supersky:main");
			expect(frame).not.toContain("Handled request.");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		services,
	);
});

test("opening the command menu does not move the welcome composer", async () => {
	await withApp(async (setup) => {
		const initialGeometry = captureRenderableGeometryByConstructorName(
			setup.renderer.root,
			"TextareaRenderable",
		);

		await typeText(setup, "/");
		await settleScrollLayout(setup);

		const settledGeometry = captureRenderableGeometryByConstructorName(
			setup.renderer.root,
			"TextareaRenderable",
		);

		expect(settledGeometry.x).toBe(initialGeometry.x);
		expect(settledGeometry.y).toBe(initialGeometry.y);
		expect(settledGeometry.height).toBe(initialGeometry.height);
	});
});

test("the command menu filters as the slash query changes", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/m");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("/model");
		expect(frame).not.toContain("/login");
		expect(frame).not.toContain("/settings");
	});
});

test("enter executes the highlighted slash command directly", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await pressDown(setup);
		await pressDown(setup);
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("No models available. Use /login or set an API");
		expect(getComposerText(setup)).toBe("");
		expect(frame).not.toContain("Assistant");
	});
});

test("tab executes the highlighted slash command directly", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/m");
		await pressTab(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("No models available. Use /login or set an API");
		expect(getComposerText(setup)).toBe("");
	});
});

test("hovering a command updates the highlighted selection", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await settleScrollLayout(setup);
		await moveMouseToRenderable(setup, slashCommandRowId("settings"));
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Settings");
		expect(frame).toContain("Select a setting to change.");
		expect(getComposerText(setup)).toBe("");
	});
});

test("clicking a command executes it directly", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await settleScrollLayout(setup);
		await clickRenderable(setup, slashCommandRowId("model"));
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("No models available. Use /login or set an API");
		expect(getComposerText(setup)).toBe("");
	});
});

test("submitting /login opens the provider picker", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Search");
		expect(frame).toContain("Anthropic (Claude Pro/Max)");
		expect(frame).toContain("GitHub Copilot");
		expect(getComposerText(setup)).toBe("");
	});
});

test("submitting /login after dismissing the slash menu with escape opens the provider picker", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await pressEscape(setup);
		await settleScrollLayout(setup);
		await typeText(setup, "login");
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Select provider to login");
		expect(frame).toContain("GitHub Copilot");
		expect(getComposerText(setup)).toBe("");
	});
});

test("selecting a provider logs in and updates the footer", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "anthropic"),
		);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("claude-opus-4-6");
	});
});

test("the provider picker supports keyboard navigation", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await pressDown(setup);
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("gpt-4o");
	});
});

test("the provider picker keeps the current provider left aligned", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/login");
		await settleScrollLayout(setup);

		expectRowsLeftAligned(
			setup.renderer.root,
			getCommandPickerRowId("provider", "google-gemini-cli"),
			getCommandPickerRowId("provider", "anthropic"),
		);
	});
});

test("manual login providers show the login dialog and accept callback input", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "openai-codex"),
		);
		await settleScrollLayout(setup);

		let frame = setup.captureCharFrame();

		expect(frame).toContain("Login to ChatGPT Plus/Pro (Codex Subscription)");
		expect(frame).toContain("https://auth.example.test/openai-codex");

		await submitText(
			setup,
			"http://localhost:1455/auth/callback?code=ok&state=test",
		);
		await settleScrollLayout(setup);

		frame = setup.captureCharFrame();

		expect(frame).toContain("gpt-5.4");
	});
});

test("submitting /model shows an empty state until a provider is connected", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/model");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("No models available. Use /login or set an API");
		expect(frame).toContain("Select model");
		expect(frame).toContain("Search");
		expect(frame).not.toContain("Assistant");
	});
});

test("the model picker only shows models for authenticated providers", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "anthropic"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Select model");
		expect(frame).toContain("claude-sonnet-4-5");
		expect(frame).not.toContain("gpt-5.4-mini");
	});
});

test("submitting /model after dismissing the slash menu with escape opens the model picker", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "anthropic"),
		);
		await settleScrollLayout(setup);

		await typeText(setup, "/");
		await pressEscape(setup);
		await typeText(setup, "model");
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Select model");
		expect(getComposerText(setup)).toBe("");
	});
});

test("selecting a model updates the footer", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await clickRenderable(
			setup,
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
		);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("gemini-2.5-flash");
	});
});

test("submitting /variants opens the thinking-level picker and updates the footer", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "anthropic"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/variants");
		await clickRenderable(setup, getCommandPickerRowId("variants", "high"));
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("claude-opus-4-6 · high");
	});
});

test("the model picker supports keyboard navigation", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await pressDown(setup);
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("gemini-2.5-flash");
	});
});

test("the model picker keeps the selected model left aligned", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await clickRenderable(
			setup,
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await settleScrollLayout(setup);

		expectRowsLeftAligned(
			setup.renderer.root,
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-pro"),
		);
	});
});

test("/model with an exact match switches immediately", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "anthropic"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model claude-haiku-4");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("claude-haiku-4");
		expect(frame).not.toContain("Select model");
	});
});

test("selected provider and model persist across /new", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await clickRenderable(
			setup,
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "new session please");
		await submitText(setup, "/new");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("supersky");
		expect(frame).not.toContain("new session please");
		expect(frame).toContain("gemini-2.5-flash");
	});
});

test("selected provider and model persist across app restarts", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await submitText(setup, "/login");
			await clickRenderable(
				setup,
				getCommandPickerRowId("provider", "google-gemini-cli"),
			);
			await settleScrollLayout(setup);

			await submitText(setup, "/model");
			await clickRenderable(
				setup,
				getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
			);
			await settleScrollLayout(setup);

			expect(setup.captureCharFrame()).toContain("gemini-2.5-flash");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);

	await withApp(
		(setup) => {
			expect(setup.captureCharFrame()).toContain("gemini-2.5-flash");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("reopening supersky starts on the welcome page instead of the last session", async () => {
	const sharedServices = createFakeSessionServices();
	sharedServices.sessionStore.createSession({
		id: "stored-session",
		title: "Stored session",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
	});
	sharedServices.sessionStore.replaceSessionMessages(
		"stored-session",
		createStoredSessionMessages("saved message"),
	);
	sharedServices.sessionStore.setLastActiveSessionId("stored-session");

	await withApp(
		(setup) => {
			const frame = setup.captureCharFrame();
			const banner = findRenderableByConstructorName(
				setup.renderer.root,
				"ASCIIFontRenderable",
			);

			expect(banner).not.toBeNull();
			expect(frame).not.toContain("saved message");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("launching supersky without sending a message does not create a session", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		(setup) => {
			expect(setup.captureCharFrame()).toContain("supersky");
			expect(sharedServices.sessionStore.listSessions()).toHaveLength(0);
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);

	expect(sharedServices.sessionStore.listSessions()).toHaveLength(0);
});

test("launching with a session id opens that session directly", async () => {
	const sharedServices = createFakeSessionServices();
	const sessionId = "stored-session";
	sharedServices.sessionStore.createSession({
		id: sessionId,
		title: "Stored session",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
	});
	sharedServices.sessionStore.replaceSessionMessages(
		sessionId,
		createStoredSessionMessages("saved message"),
	);

	await withApp(
		(setup) => {
			const frame = setup.captureCharFrame();
			const banner = findRenderableByConstructorName(
				setup.renderer.root,
				"ASCIIFontRenderable",
			);

			expect(frame).toContain("saved message");
			expect(banner).toBeNull();
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
		{ initialSessionId: sessionId },
	);
});

test("submitting /export writes a markdown transcript to the workspace root", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "supersky-export-"));
	const sharedServices = createFakeSessionServices({ workspaceRoot });

	try {
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);
				const sessionId = getCurrentSessionId(sharedServices);
				if (!sessionId) {
					throw new Error("Expected an active session to exist");
				}

				await submitText(setup, "/export");
				await settleScrollLayout(setup);
				const exportPath = join(workspaceRoot, `supersky_${sessionId}.md`);
				expect(existsSync(exportPath)).toBe(false);

				const frameBeforeConfirm = setup.captureCharFrame();
				expect(frameBeforeConfirm).toContain("Export session?");

				await pressEnter(setup);
				await settleScrollLayout(setup);

				const content = await readFile(exportPath, "utf8");
				const frame = setup.captureCharFrame();

				expect(content).toContain(
					`# ${sharedServices.sessionStore.getSession(sessionId)?.title}`,
				);
				expect(content).toContain("## User");
				expect(content).toContain("## Assistant");
				expect(frame).toContain("Exported session to");
				expect(frame).toContain(sessionId);
			},
			undefined,
			undefined,
			sharedServices,
		);
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
	}
});

test("cancelling /export confirm dialog does not write a file", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-export-cancel-"),
	);
	const sharedServices = createFakeSessionServices({ workspaceRoot });

	try {
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);
				const sessionId = getCurrentSessionId(sharedServices);
				if (!sessionId) {
					throw new Error("Expected an active session to exist");
				}

				await submitText(setup, "/export");
				await settleScrollLayout(setup);

				const exportPath = join(workspaceRoot, `supersky_${sessionId}.md`);
				await pressEscape(setup);
				await settleScrollLayout(setup);

				expect(existsSync(exportPath)).toBe(false);
			},
			undefined,
			undefined,
			sharedServices,
		);
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
	}
});

test("submitting /compact replaces the active transcript with a compacted summary", async () => {
	const compactSpy = spyOn(compaction, "compactSession").mockResolvedValue({
		summary: "## Goal\n- Ship the feature",
		archivedMessages: createStoredSessionMessages("old context"),
		compactedMessages: [
			compaction.createCompactionSummaryMessage({
				summary: "## Goal\n- Ship the feature",
				hiddenMessageCount: 2,
				archivedMessageCount: 2,
			}),
			...createStoredSessionMessages("recent context"),
		],
		hiddenMessageCount: 2,
		archivedMessageCount: 2,
	});

	try {
		const sharedServices = createFakeSessionServices();
		await withApp(
			async (setup) => {
				await sendMessages(setup, 1);
				await settleScrollLayout(setup);
				await submitText(setup, "/compact");
				await settleScrollLayout(setup);

				const sessionId = getCurrentSessionId(sharedServices);
				if (!sessionId) {
					throw new Error("Expected active session");
				}

				const frame = setup.captureCharFrame();
				const stored = sharedServices.sessionStore.getSession(sessionId);

				expect(frame).toContain("Session compacted");
				expect(frame).toContain("Summarized 2 messages.");
				expect(stored?.archivedMessages).toHaveLength(1);
				expect(stored?.messages[0]).toMatchObject({
					role: "compactionSummary",
				});
			},
			undefined,
			undefined,
			sharedServices,
		);
	} finally {
		compactSpy.mockRestore();
	}
});

test("the session picker can copy the current session id", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);
			await submitText(setup, "/sessions");
			let frame = setup.captureCharFrame();

			expect(frame).toContain("delete");
			expect(frame).toContain("ctrl+d");
			expect(frame).toContain("rename");
			expect(frame).toContain("ctrl+r");
			expect(frame).toContain("copy");
			expect(frame).toContain("ctrl+k");

			await pressCtrlK(setup);
			await settleScrollLayout(setup);

			const sessionId = sharedServices.sessionStore.listSessions()[0]?.id;

			expect(sessionId).toBeTruthy();
			expect(copyToClipboardSpy).toHaveBeenCalledWith(sessionId);
			frame = setup.captureCharFrame();
			expect(frame).toContain("Session ID copied to clipboard.");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("the session picker groups sessions by day and filters by search", async () => {
	const sharedServices = createFakeSessionServices();
	const now = Date.now();
	const olderTimestamp = now - 2 * 86_400_000;
	const olderDayLabel = new Date(olderTimestamp).toDateString();

	sharedServices.sessionStore.createSession({
		id: "today-session",
		title: "Today notes",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now,
	});
	sharedServices.sessionStore.createSession({
		id: "older-session",
		title: "Older incident",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: olderTimestamp,
	});

	await withApp(
		async (setup) => {
			await submitText(setup, "/sessions");
			await settleScrollLayout(setup);

			let frame = setup.captureCharFrame();

			expect(frame).toContain("Sessions");
			expect(frame).toContain("Search");
			expect(frame).toContain("Today");
			expect(frame).toContain(olderDayLabel);
			expect(frame).toContain("Today notes");
			expect(frame).toContain("Older incident");

			await typeText(setup, "older");
			await settleScrollLayout(setup);

			frame = setup.captureCharFrame();
			expect(frame).toContain("Older incident");
			expect(frame).not.toContain("Today notes");
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("the session picker keeps the current session left aligned", async () => {
	const sharedServices = createFakeSessionServices();
	const now = Date.now();

	sharedServices.sessionStore.createSession({
		id: "session-one",
		title: "Session one",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now - 1_000,
	});
	sharedServices.sessionStore.createSession({
		id: "session-two",
		title: "Session two",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now,
	});
	sharedServices.sessionStore.setLastActiveSessionId("session-two");

	await withApp(
		async (setup) => {
			await submitText(setup, "/sessions");
			await settleScrollLayout(setup);

			expectRowsLeftAligned(
				setup.renderer.root,
				getCommandPickerRowId("sessions", "session-two"),
				getCommandPickerRowId("sessions", "session-one"),
			);
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
		{ initialSessionId: "session-two" },
	);
});

test("the session picker keyboard navigation switches sessions without restoring workspace files", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-switch-workspace-"),
	);
	const snapshotsDir = await mkdtemp(
		join(tmpdir(), "supersky-switch-snapshots-"),
	);
	const filePath = join(workspaceRoot, "switch.txt");
	await writeFile(filePath, "initial\n", "utf8");
	const sharedServices = createFakeSessionServices({
		workspaceRoot,
		snapshotsDir,
	});
	const now = Date.now();

	sharedServices.sessionStore.createSession({
		id: "session-one",
		title: "Session one",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now - 1_000,
	});
	sharedServices.sessionStore.replaceSessionMessages(
		"session-one",
		createStoredSessionMessages("first saved message"),
	);
	sharedServices.sessionStore.createSession({
		id: "session-two",
		title: "Session two",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now,
	});
	sharedServices.sessionStore.replaceSessionMessages(
		"session-two",
		createStoredSessionMessages("second saved message"),
	);
	sharedServices.sessionStore.setLastActiveSessionId("session-two");

	try {
		await withApp(
			async (setup) => {
				await writeFile(
					filePath,
					"modified while session two active\n",
					"utf8",
				);
				await submitText(setup, "/sessions");
				await settleScrollLayout(setup);

				await pressDown(setup);
				await pressEnter(setup);
				await settleScrollLayout(setup);

				const frame = setup.captureCharFrame();

				expect(frame).toContain("first saved message");
				expect(frame).not.toContain("second saved message");
				expect(await readFile(filePath, "utf8")).toBe(
					"modified while session two active\n",
				);
			},
			{ width: 110, height: 30 },
			"~/projects/supersky:main",
			sharedServices,
			{ initialSessionId: "session-two" },
		);
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(snapshotsDir, { recursive: true, force: true });
	}
});

test("the session picker keeps the navigated row selected across rerenders", async () => {
	const sharedServices = createFakeSessionServices();
	const now = Date.now();

	sharedServices.sessionStore.createSession({
		id: "session-one",
		title: "Session one",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now - 1_000,
	});
	sharedServices.sessionStore.createSession({
		id: "session-two",
		title: "Session two",
		workspaceRoot: sharedServices.workspaceRoot,
		model: null,
		createdAt: now,
	});
	sharedServices.sessionStore.setLastActiveSessionId("session-two");

	await withApp(
		async (setup) => {
			await submitText(setup, "/sessions");
			await settleScrollLayout(setup);

			await pressDown(setup);
			await pressCtrlD(setup);
			await settleScrollLayout(setup);

			let frame = setup.captureCharFrame();

			expect(frame).toContain("Press Ctrl+D again to confirm");

			await pressCtrlD(setup);
			await settleScrollLayout(setup);

			frame = setup.captureCharFrame();
			expect(frame).toContain("Session deleted.");
			expect(sharedServices.sessionStore.getSession("session-one")).toBeNull();
			expect(
				sharedServices.sessionStore.getSession("session-two"),
			).not.toBeNull();
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
		{ initialSessionId: "session-two" },
	);
});

test("renaming a session saves the submitted title", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);
			await settleScrollLayout(setup);
			await submitText(setup, "/rename");
			await typeText(setup, " updated");
			await pressEnter(setup);
			await settleScrollLayout(setup);

			expect(sharedServices.sessionStore.listSessions()[0]?.title).toBe(
				"New session updated",
			);
		},
		{ width: 110, height: 30 },
		"~/projects/supersky:main",
		sharedServices,
	);
});

test("first user message triggers a short session rename", async () => {
	const sharedServices = createFakeSessionServices({
		generateSessionTitle: async () => "Fix title flow",
	});

	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);
			await settleScrollLayout(setup);

			expect(sharedServices.sessionStore.listSessions()[0]?.title).toBe(
				"Fix title flow",
			);
		},
		undefined,
		undefined,
		sharedServices,
	);
});

test("logging into another provider keeps the current model selected", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "google-gemini-cli"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/model");
		await clickRenderable(
			setup,
			getCommandPickerRowId("model", "google-gemini-cli/gemini-2.5-flash"),
		);
		await settleScrollLayout(setup);

		await submitText(setup, "/login");
		await clickRenderable(
			setup,
			getCommandPickerRowId("provider", "github-copilot"),
		);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("gemini-2.5-flash");
	});
});

test("typing past the slash command token closes the menu", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/ ");

		const frame = setup.captureCharFrame();

		expect(frame).not.toContain("/login");
	});
});

test("sending exit quits the app", async () => {
	const requestProcessExit = spyOn(
		appLifecycle,
		"requestProcessExit",
	).mockImplementation(() => {});

	try {
		await withApp(async (setup) => {
			await submitText(setup, "exit");
			await Promise.resolve();

			expect(setup.renderer.isDestroyed).toBe(true);
			expect(requestProcessExit).toHaveBeenCalledTimes(1);
		});
	} finally {
		requestProcessExit.mockRestore();
	}
});

test("sending slash exit quits the app", async () => {
	const requestProcessExit = spyOn(
		appLifecycle,
		"requestProcessExit",
	).mockImplementation(() => {});

	try {
		await withApp(async (setup) => {
			await submitText(setup, "/exit");
			await Promise.resolve();

			expect(setup.renderer.isDestroyed).toBe(true);
			expect(requestProcessExit).toHaveBeenCalledTimes(1);
		});
	} finally {
		requestProcessExit.mockRestore();
	}
});

test("treats the exit command case-insensitively after trimming", async () => {
	const requestProcessExit = spyOn(
		appLifecycle,
		"requestProcessExit",
	).mockImplementation(() => {});

	try {
		await withApp(async (setup) => {
			await submitText(setup, "  ExIt  ");
			await Promise.resolve();

			expect(setup.renderer.isDestroyed).toBe(true);
			expect(requestProcessExit).toHaveBeenCalledTimes(1);
		});
	} finally {
		requestProcessExit.mockRestore();
	}
});

test("pressing ctrl+c quits the app", async () => {
	const requestProcessExit = spyOn(
		appLifecycle,
		"requestProcessExit",
	).mockImplementation(() => {});

	try {
		await withApp(async (setup) => {
			await pressCtrlC(setup);
			await Promise.resolve();

			expect(setup.renderer.isDestroyed).toBe(true);
			expect(requestProcessExit).toHaveBeenCalledTimes(1);
		});
	} finally {
		requestProcessExit.mockRestore();
	}
});

test("pressing escape does not quit the app", async () => {
	const requestProcessExit = spyOn(
		appLifecycle,
		"requestProcessExit",
	).mockImplementation(() => {});

	try {
		await withApp(async (setup) => {
			await pressEscape(setup);
			await Promise.resolve();

			expect(setup.renderer.isDestroyed).toBe(false);
			expect(requestProcessExit).not.toHaveBeenCalled();
		});
	} finally {
		requestProcessExit.mockRestore();
	}
});

test("ignores whitespace-only submissions", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "   ");

		const frame = setup.captureCharFrame();

		expect(frame).toContain("supersky");
		expect(frame).not.toContain("Assistant");
	});
});

test("inserts a newline for multiline enter", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "line one");
		await pressLinefeed(setup);
		await typeText(setup, "line two");

		const frame = setup.captureCharFrame();

		expect(frame).not.toContain("Assistant");
		expect(frame).toContain("line one");
		expect(frame).toContain("line two");
	});
});

test("sending a multiline message does not add an extra blank line", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "line one");
		await pressLinefeed(setup);
		await typeText(setup, "line two");
		await pressEnter(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();
		const lines = frame.split("\n");
		const lineTwoIndex = lines.findIndex((line) => line.includes("line two"));
		const timestampPattern = /\b\d{1,2}:\d{2}:\d{2} (AM|PM)\b/;
		const linesAfterMessage = lines
			.slice(lineTwoIndex + 1, lineTwoIndex + 7)
			.join("\n");

		expect(lineTwoIndex).toBeGreaterThan(-1);
		expect(lines[lineTwoIndex + 1]?.trim()).toMatch(timestampPattern);
		expect(linesAfterMessage).toContain("Handled request.");
	});
});

test("up arrow recalls the most recent sent user message", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "first prompt");
		await submitText(setup, "second prompt");
		await pressUp(setup);

		expect(getComposerText(setup)).toBe("second prompt");
	});
});

test("up and down walk through submitted user message history", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "first prompt");
		await submitText(setup, "second prompt");
		await submitText(setup, "third prompt");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("third prompt");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("third prompt");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("second prompt");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("third prompt");
	});
});

test("down arrow restores the unsent draft after leaving history", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "saved prompt");
		await typeText(setup, "draft in progress");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("draft in progress");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("saved prompt");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("draft in progress");
	});
});

test("up and down include submitted shell commands in composer history", async () => {
	const executeUserShellCommandSpy = spyOn(
		userShell,
		"executeUserShellCommand",
	).mockResolvedValue({
		output: "shell output",
		exitCode: 0,
		cancelled: false,
		truncated: false,
	});

	try {
		await withApp(async (setup) => {
			await submitText(setup, "first prompt");
			await submitText(setup, "!pwd");
			await settleScrollLayout(setup);
			await submitText(setup, "!!git status");
			await settleScrollLayout(setup);

			await pressUp(setup);
			expect(getComposerText(setup)).toBe("!!git status");

			await pressUp(setup);
			expect(getComposerText(setup)).toBe("!!git status");

			await pressUp(setup);
			expect(getComposerText(setup)).toBe("!pwd");

			await pressDown(setup);
			expect(getComposerText(setup)).toBe("!!git status");

			await pressDown(setup);
			expect(getComposerText(setup)).toBe("");
		});
	} finally {
		executeUserShellCommandSpy.mockRestore();
	}
});

test("up arrow moves to the previous line before recalling history", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "saved prompt");
		await typeText(setup, "x");
		await pressLinefeed(setup);
		await typeText(setup, "long line");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("x\nlong line");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("x\nlong line");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("saved prompt");
	});
});

test("down arrow moves to the next line before leaving history", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "x");
		await pressLinefeed(setup);
		await typeText(setup, "long line");
		await pressEnter(setup);
		await typeText(setup, "draft in progress");

		await pressUp(setup);
		await pressUp(setup);
		expect(getComposerText(setup)).toBe("x\nlong line");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("x\nlong line");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("x\nlong line");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("draft in progress");
	});
});

test("down arrow moves to the end before leaving history", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "saved prompt");
		await typeText(setup, "draft in progress");

		await pressUp(setup);
		await pressUp(setup);
		expect(getComposerText(setup)).toBe("saved prompt");

		await pressUp(setup);
		expect(getComposerText(setup)).toBe("saved prompt");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("saved prompt");

		await pressDown(setup);
		expect(getComposerText(setup)).toBe("draft in progress");
	});
});

test("shows the sidebar in-session on wide terminals", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);

		expect(isSidebarVisible(setup)).toBe(true);
	});
});

test("keeps the scrollbar hidden when the in-session view first appears without overflow", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);

		const scrollbox = findScrollbox(setup.renderer.root);

		expect(areScrollbarsHidden(scrollbox)).toBe(true);
	});
});

test("keeps the scrollbars hidden after the message list overflows", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 4);
		await settleScrollLayout(setup);

		const scrollbox = findScrollbox(setup.renderer.root);

		expect(areScrollbarsHidden(scrollbox)).toBe(true);
	});
});

test("hides the sidebar on narrow terminals", async () => {
	await withApp(
		async (setup) => {
			await sendMessages(setup, 1);

			expect(isSidebarVisible(setup)).toBe(false);
		},
		{ width: SIDEBAR_LAYOUT_WIDTH - 1, height: 30 },
	);
});

test("uses a shorter block welcome banner when the sidebar would not fit", async () => {
	let wideBannerWidth = 0;

	await withApp(
		async (setup) => {
			const banner = findRenderableByConstructorName(
				setup.renderer.root,
				"ASCIIFontRenderable",
			);

			expect(banner).not.toBeNull();
			wideBannerWidth = banner?.width ?? 0;
		},
		{ width: SIDEBAR_LAYOUT_WIDTH, height: 30 },
	);

	await withApp(
		async (setup) => {
			const banner = findRenderableByConstructorName(
				setup.renderer.root,
				"ASCIIFontRenderable",
			);

			expect(banner).not.toBeNull();
			expect(banner?.width ?? 0).toBeLessThan(wideBannerWidth);
		},
		{ width: SIDEBAR_LAYOUT_WIDTH - 1, height: 30 },
	);
});

test("ctrl+n resets an in-session view back to the welcome screen", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "new session please");
		await pressCtrlN(setup);
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("supersky");
		expect(frame).not.toContain("new session please");
		expect(frame).not.toContain("Assistant");
	});
});

test("slash new resets an in-session view back to the welcome screen", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await submitText(setup, "new session please");
			await submitText(setup, "/new");
			await settleScrollLayout(setup);

			const frame = setup.captureCharFrame();

			expect(frame).toContain("supersky");
			expect(frame).not.toContain("new session please");
			expect(frame).not.toContain("Assistant");
			expect(sharedServices.sessionStore.listSessions()).toHaveLength(1);
		},
		undefined,
		undefined,
		sharedServices,
	);

	expect(sharedServices.sessionStore.listSessions()).toHaveLength(1);
});

test("opening the command menu does not move the in-session composer", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);

		const initialGeometry = captureShellGeometry(setup.renderer.root);

		await typeText(setup, "/");
		await settleScrollLayout(setup);

		const settledGeometry = captureShellGeometry(setup.renderer.root);

		expect(settledGeometry.scrollboxX).toBe(initialGeometry.scrollboxX);
		expect(settledGeometry.footerY).toBe(initialGeometry.footerY);
		expect(settledGeometry.footerHeight).toBe(initialGeometry.footerHeight);
		expect(settledGeometry.bodyHeight).toBe(initialGeometry.bodyHeight);
		expect(settledGeometry.composerX).toBe(initialGeometry.composerX);
		expect(settledGeometry.composerY).toBe(initialGeometry.composerY);
		expect(settledGeometry.composerHeight).toBe(initialGeometry.composerHeight);
	});
});

test("submitting /settings opens the settings picker", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/settings");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Settings");
		expect(frame).toContain("Provider");
		expect(frame).toContain("Model");
		expect(frame).toContain("Thinking level");
		expect(frame).toContain("Editor");
		expect(frame).not.toContain("Assistant");
		expect(getComposerText(setup)).toBe("");
	});
});

test("submitting /copy copies the last assistant message", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);
		await submitText(setup, "/copy");
		await settleScrollLayout(setup);

		expect(copyToClipboardSpy).toHaveBeenCalledWith("Handled request.");
		expect(setup.captureCharFrame()).toContain(
			"Last assistant message copied to clipboard.",
		);
	});
});

test("submitting /hotkey opens the hotkeys dialog", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/hotkey");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Supersky hotkeys");
		expect(frame).toContain("Ctrl+N");
		expect(frame).toContain("Start a new session");
	});
});

test("submitting /editor launches the configured editor", async () => {
	const sharedServices = createFakeSessionServices();

	await withApp(
		async (setup) => {
			await submitText(setup, "/editor");
			await settleScrollLayout(setup);

			expect(launchEditorSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					preset: "system",
					workspaceRoot: sharedServices.workspaceRoot,
				}),
			);
			expect(setup.captureCharFrame()).toContain("Opened ");
		},
		undefined,
		undefined,
		sharedServices,
	);
});

test("submitting an unknown slash command shows an error notice", async () => {
	await withApp(async (setup) => {
		await submitText(setup, "/wat");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("Unknown command: /wat");
		expect(frame).not.toContain("Assistant");
		expect(getComposerText(setup)).toBe("");
	});
});

test("keeps the footer anchored as messages overflow", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);

		const initialGeometry = captureShellGeometry(setup.renderer.root);

		await sendMessages(setup, 3, 1);
		await settleScrollLayout(setup);

		const settledGeometry = captureShellGeometry(setup.renderer.root);

		expect(isSidebarVisible(setup)).toBe(true);
		expect(settledGeometry.scrollboxX).toBe(initialGeometry.scrollboxX);
		expect(settledGeometry.footerY).toBe(initialGeometry.footerY);
		expect(settledGeometry.footerHeight).toBe(initialGeometry.footerHeight);
		expect(settledGeometry.bodyHeight).toBe(initialGeometry.bodyHeight);
	});
});

test("keeps a bottom gap between the in-session panels and footer", async () => {
	await withApp(async (setup) => {
		await sendMessages(setup, 1);
		await settleScrollLayout(setup);

		const geometry = captureShellGeometry(setup.renderer.root);
		const sidebarBottom = geometry.sidebarBottom;

		expect(geometry.footerY - geometry.mainBottom).toBe(1);
		if (sidebarBottom === null) {
			throw new Error("Expected the sidebar to be visible");
		}
		expect(geometry.footerY - sidebarBottom).toBe(1);
	});
});
