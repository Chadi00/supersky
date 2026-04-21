import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { App } from "../App";

const DEFAULT_PROJECT_LINE = "~/projects/supersky:main";

type TerminalSize = {
  width: number;
  height: number;
};

type RenderableNode = {
  constructor?: { name?: string };
  getChildren?: () => unknown[];
  x?: number;
  y?: number;
  height?: number;
  plainText?: string;
  verticalScrollBar?: { visible: boolean };
  horizontalScrollBar?: { visible: boolean };
};

type GeometryNode = {
  x: number;
  y: number;
  height: number;
  getChildren: () => unknown[];
};

type ScrollboxNode = {
  verticalScrollBar: { visible: boolean };
  horizontalScrollBar: { visible: boolean };
};

export type AppTestSetup = Awaited<ReturnType<typeof testRender>>;

const DEFAULT_TERMINAL_SIZE: TerminalSize = {
  width: 110,
  height: 30,
};

// OpenTUI renderers share terminal-style global input state, so App tests must run one at a time.
let appTestQueue = Promise.resolve();

function isRenderableNode(node: unknown): node is RenderableNode {
  return typeof node === "object" && node !== null;
}

function getChildren(node: unknown) {
  if (!isRenderableNode(node) || typeof node.getChildren !== "function") {
    return [];
  }

  return node.getChildren();
}

function expectGeometryNode(node: unknown, label: string): GeometryNode {
  if (
    !isRenderableNode(node) ||
    typeof node.x !== "number" ||
    typeof node.y !== "number" ||
    typeof node.height !== "number" ||
    typeof node.getChildren !== "function"
  ) {
    throw new Error(`Expected ${label} geometry node`);
  }

  return node as GeometryNode;
}

function findRenderable(
  node: unknown,
  predicate: (candidate: RenderableNode) => boolean,
): RenderableNode | null {
  if (!isRenderableNode(node)) {
    return null;
  }

  if (predicate(node)) {
    return node;
  }

  for (const child of getChildren(node)) {
    const found = findRenderable(child, predicate);
    if (found) {
      return found;
    }
  }

  return null;
}

function runAppTestSerial<T>(work: () => Promise<T>) {
  const nextRun = appTestQueue.then(work, work);
  appTestQueue = nextRun.then(
    () => undefined,
    () => undefined,
  );

  return nextRun;
}

async function flushRenders(setup: AppTestSetup, renderPasses = 1) {
  for (let pass = 0; pass < renderPasses; pass += 1) {
    await setup.renderOnce();
  }
}

async function runInput(
  setup: AppTestSetup,
  action: () => void | Promise<void>,
  options?: {
    renderPasses?: number;
    settleMs?: number;
  },
) {
  await act(async () => {
    await action();

    if (options?.settleMs) {
      await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    }

    await flushRenders(setup, options?.renderPasses ?? 1);
  });
}

async function destroyApp(setup: AppTestSetup) {
  act(() => {
    setup.renderer.destroy();
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function renderApp(
  size: TerminalSize = DEFAULT_TERMINAL_SIZE,
  projectLine = DEFAULT_PROJECT_LINE,
) {
  const setup = await testRender(<App projectLine={projectLine} />, {
    ...size,
    exitOnCtrlC: false,
  });

  await runInput(setup, () => undefined);

  return setup;
}

export async function withApp(
  run: (setup: AppTestSetup) => Promise<void> | void,
  size: TerminalSize = DEFAULT_TERMINAL_SIZE,
  projectLine = DEFAULT_PROJECT_LINE,
) {
  return runAppTestSerial(async () => {
    const setup = await renderApp(size, projectLine);

    try {
      await run(setup);
    } finally {
      await destroyApp(setup);
    }
  });
}

export async function typeText(setup: AppTestSetup, text: string) {
  await runInput(setup, () => setup.mockInput.typeText(text), {
    renderPasses: 3,
  });
}

export async function submitText(setup: AppTestSetup, text: string) {
  await typeText(setup, text);
  await pressEnter(setup);
  await runInput(setup, () => undefined, {
    renderPasses: 2,
  });
}

export async function pressEnter(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressEnter(), {
    renderPasses: 5,
  });
}

export async function pressCtrlC(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressCtrlC(), {
    renderPasses: 2,
  });
}

export async function pressCtrlN(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressKey("n", { ctrl: true }), {
    renderPasses: 2,
    settleMs: 0,
  });
}

export async function pressUp(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressArrow("up"), {
    renderPasses: 2,
  });
}

export async function pressDown(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressArrow("down"), {
    renderPasses: 2,
  });
}

export async function pressLinefeed(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressKey("LINEFEED"));
}

export async function pressTab(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressTab(), {
    renderPasses: 2,
  });
}

export async function pressEscape(setup: AppTestSetup) {
  await runInput(setup, () => setup.mockInput.pressEscape(), {
    renderPasses: 2,
  });
}

export async function sendMessages(
  setup: AppTestSetup,
  count: number,
  startIndex = 0,
) {
  await runInput(
    setup,
    async () => {
      for (let index = 0; index < count; index += 1) {
        await setup.mockInput.typeText(`message ${startIndex + index}`);
        setup.mockInput.pressEnter();
        await flushRenders(setup);
      }
    },
    { renderPasses: 1 },
  );
}

export async function settleScrollLayout(setup: AppTestSetup) {
  await runInput(setup, () => undefined, { settleMs: 30 });
}

export function findScrollbox(node: unknown): ScrollboxNode | null {
  const scrollbox = findRenderable(
    node,
    (candidate) =>
      candidate.constructor?.name === "ScrollBoxRenderable" &&
      typeof candidate.verticalScrollBar?.visible === "boolean" &&
      typeof candidate.horizontalScrollBar?.visible === "boolean",
  );

  return scrollbox as ScrollboxNode | null;
}

export function findRenderableByConstructorName(
  node: unknown,
  constructorName: string,
) {
  return findRenderable(
    node,
    (candidate) => candidate.constructor?.name === constructorName,
  );
}

export function areScrollbarsHidden(scrollbox: ScrollboxNode | null) {
  return (
    scrollbox !== null &&
    !scrollbox.verticalScrollBar.visible &&
    !scrollbox.horizontalScrollBar.visible
  );
}

export function getComposerText(setup: AppTestSetup) {
  const textarea = findRenderableByConstructorName(
    setup.renderer.root,
    "TextareaRenderable",
  );

  if (!textarea || typeof textarea.plainText !== "string") {
    throw new Error("Expected composer textarea");
  }

  return textarea.plainText;
}

export function isSidebarVisible(setup: AppTestSetup) {
  const appShell = getChildren(setup.renderer.root)[0];
  const body = getChildren(appShell)[0];
  const sessionLayout = getChildren(body)[0];

  return getChildren(sessionLayout).length > 1;
}

export function captureShellGeometry(root: unknown) {
  const appShell = expectGeometryNode(getChildren(root)[0], "app shell");
  const body = expectGeometryNode(appShell.getChildren()[0], "body");
  const footer = expectGeometryNode(appShell.getChildren()[1], "footer");
  const sessionLayout = expectGeometryNode(
    body.getChildren()[0],
    "session layout",
  );
  const mainPanel = expectGeometryNode(
    sessionLayout.getChildren()[0],
    "main session panel",
  );
  const sidebarNode = sessionLayout.getChildren()[1];
  const scrollbox = expectGeometryNode(findScrollbox(root), "scrollbox");
  const sidebar = sidebarNode
    ? expectGeometryNode(sidebarNode, "session sidebar")
    : null;

  return {
    scrollboxX: scrollbox.x,
    footerY: footer.y,
    footerHeight: footer.height,
    bodyHeight: body.height,
    mainBottom: mainPanel.y + mainPanel.height,
    sidebarBottom: sidebar ? sidebar.y + sidebar.height : null,
  };
}
