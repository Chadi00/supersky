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
