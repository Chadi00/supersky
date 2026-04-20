import { expect, spyOn, test } from "bun:test";
import { appLifecycle } from "./shared/lifecycle";
import {
  areScrollbarsHidden,
  captureShellGeometry,
  findRenderableByConstructorName,
  findScrollbox,
  isSidebarVisible,
  pressCtrlC,
  pressCtrlN,
  pressEnter,
  pressLinefeed,
  sendMessages,
  settleScrollLayout,
  submitText,
  typeText,
  withApp,
} from "./test/appTestUtils";

test("renders the supersky TUI shell (new session)", async () => {
  await withApp((setup) => {
    const frame = setup.captureCharFrame();
    const banner = findRenderableByConstructorName(
      setup.renderer.root,
      "ASCIIFontRenderable",
    );

    expect(banner).not.toBeNull();
    expect(frame).not.toContain("___ _ _ _ __ ___ _ __ ___| | ___ _");
    expect(frame).toContain("GPT-5.4 OpenAI");
  });
});

test("preserves rapid composer typing without resetting the draft", async () => {
  await withApp(async (setup) => {
    await typeText(setup, "fast typing should stay stable");

    const frame = setup.captureCharFrame();

    expect(frame).toContain("fast typing should stay stable");
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
    expect(linesAfterMessage).toContain("==== OpenTUI Task Complete ====");
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
    { width: 70, height: 30 },
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
