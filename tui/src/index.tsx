import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import { resolveProjectLine } from "./app/projectLine";

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	enableMouseMovement: true,
	targetFps: 60,
	consoleOptions: {
		keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
	},
});

createRoot(renderer).render(<App projectLine={resolveProjectLine()} />);
