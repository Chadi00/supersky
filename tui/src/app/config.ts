export const appMetadata = {
	version: "0.1.0",
} as const;

export const assistantDemoSummary = {
	framework: "react",
	changeSummary:
		"Refactored the shell into focused modules with testable session state.",
	mainFiles: ["tui/src/App.tsx", "tui/src/session/useSessionController.ts"],
	verificationCommand: "bun run check",
} as const;

export const sidebarData = {
	title: "Minimalist fullscreen TUI for supersky",
	usage: ["57,829 tokens", "6% used", "$0.00 spent"],
	modifiedFiles: [
		{ delta: "+102", path: "tui/src/session/useSessionController.ts" },
		{ delta: "+78", path: "tui/src/App.test.tsx" },
	],
} as const;
