export type HotkeyEntry = {
	shortcut: string;
	action: string;
};

export const superskyHotkeys: HotkeyEntry[] = [
	{ shortcut: "Enter", action: "Send message" },
	{ shortcut: "Shift+Enter", action: "Insert newline" },
	{ shortcut: "Up / Down", action: "Browse composer history" },
	{ shortcut: "/", action: "Open slash commands" },
	{ shortcut: "!", action: "Run shell command" },
	{ shortcut: "!!", action: "Run shell command without context" },
	{ shortcut: "Esc", action: "Close dialog or cancel shell/streaming" },
	{ shortcut: "Ctrl+N", action: "Start a new session" },
	{ shortcut: "Ctrl+C", action: "Quit supersky" },
	{ shortcut: "Ctrl+D", action: "Delete selected session in /sessions" },
	{ shortcut: "Ctrl+R", action: "Rename selected session in /sessions" },
	{ shortcut: "Ctrl+K", action: "Copy selected session id in /sessions" },
];
