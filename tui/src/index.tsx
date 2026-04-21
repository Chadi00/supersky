import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import { resolveProjectLine } from "./app/projectLine";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  targetFps: 60,
});

createRoot(renderer).render(<App projectLine={resolveProjectLine()} />);
