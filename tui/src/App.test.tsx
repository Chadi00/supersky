import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { getCommandPickerRowId } from "./session/commandPicker";
import { SIDEBAR_LAYOUT_WIDTH } from "./session/layout";
import * as browser from "./session/providerState/browser";
import { appLifecycle } from "./shared/lifecycle";
import {
	areScrollbarsHidden,
	captureRenderableGeometryByConstructorName,
	captureShellGeometry,
	clickFirstScrollBox,
	clickRenderable,
	findRenderableByConstructorName,
	findScrollbox,
	getComposerText,
	isSidebarVisible,
	moveMouseToRenderable,
	pressCtrlC,
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

function slashCommandRowId(commandName: string) {
	return `slash-command-item-${commandName}`;
}

let openUrlSpy: ReturnType<typeof spyOn<typeof browser, "openUrlInBrowser">>;

beforeEach(() => {
	// Auth tests trigger browser-launch callbacks; stub them so the suite never
	// leaves real browser windows behind.
	openUrlSpy = spyOn(browser, "openUrlInBrowser").mockImplementation(() => {});
});

afterEach(() => {
	openUrlSpy.mockRestore();
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

		expect(frame).toContain("Assistant");
		expect(frame).toContain("send on enter");
		expect(occurrences).toBe(1);
		expect(timestampMatch).not.toBeNull();
	});
});

test("typing slash opens the command menu", async () => {
	await withApp(async (setup) => {
		await typeText(setup, "/");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("/login");
		expect(frame).toContain("/logout");
		expect(frame).toContain("/model");
		expect(frame).toContain("/settings");
		expect(frame).toContain("/new");
		expect(frame).toContain("/exit");
	});
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

		expect(frame).toContain("Settings screen not implemented yet.");
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
		expect(linesAfterMessage).toContain("Assistant");
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
	await withApp(async (setup) => {
		await submitText(setup, "new session please");
		await submitText(setup, "/new");
		await settleScrollLayout(setup);

		const frame = setup.captureCharFrame();

		expect(frame).toContain("supersky");
		expect(frame).not.toContain("new session please");
		expect(frame).not.toContain("Assistant");
	});
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

for (const [command, notice] of [
	["/settings", "Settings screen not implemented yet."],
] as const) {
	test(`submitting ${command} shows the stub notice`, async () => {
		await withApp(async (setup) => {
			await submitText(setup, command);
			await settleScrollLayout(setup);

			const frame = setup.captureCharFrame();

			expect(frame).toContain(notice);
			expect(frame).not.toContain("Assistant");
			expect(getComposerText(setup)).toBe("");
		});
	});
}

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
