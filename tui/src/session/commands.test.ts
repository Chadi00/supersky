import { expect, test } from "bun:test";

import {
  EXIT_COMMAND,
  isExitCommand,
  isExitShortcut,
  isNewSessionShortcut,
  normalizeCommandInput,
} from "./commands";

test("normalizes command input before matching", () => {
  expect(normalizeCommandInput("  ExIt  ")).toBe(EXIT_COMMAND);
});

test("matches the exit command case-insensitively", () => {
  expect(isExitCommand("exit")).toBe(true);
  expect(isExitCommand(" Exit ")).toBe(true);
  expect(isExitCommand("quit")).toBe(false);
});

test("matches escape and ctrl+c as exit shortcuts", () => {
  expect(isExitShortcut({ name: "escape", ctrl: false })).toBe(true);
  expect(isExitShortcut({ name: "c", ctrl: true })).toBe(true);
  expect(isExitShortcut({ name: "c", ctrl: false })).toBe(false);
});

test("matches ctrl+n as the new-session shortcut", () => {
  expect(isNewSessionShortcut({ name: "n", ctrl: true })).toBe(true);
  expect(isNewSessionShortcut({ name: "n", ctrl: false })).toBe(false);
});
