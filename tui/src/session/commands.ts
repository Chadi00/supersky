import type { KeyBinding } from "@opentui/core";

export const EXIT_COMMAND = "exit";

export const composerKeyBindings: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "linefeed", action: "newline" },
];

type ShortcutKey = {
  name: string;
  ctrl: boolean;
};

export function normalizeCommandInput(input: string) {
  return input.trim().toLowerCase();
}

export function isExitCommand(input: string) {
  return normalizeCommandInput(input) === EXIT_COMMAND;
}

export function isExitShortcut(key: ShortcutKey) {
  return key.name === "escape" || (key.ctrl && key.name === "c");
}

export function isNewSessionShortcut(key: ShortcutKey) {
  return key.ctrl && key.name === "n";
}
