import { expect, test } from "bun:test";

import {
	EXIT_COMMAND,
	getMatchingSlashCommands,
	getSlashMenuQuery,
	isExitCommand,
	isExitShortcut,
	isNewSessionShortcut,
	MODEL_COMMAND,
	NEW_SESSION_COMMAND,
	normalizeCommandInput,
	parseSubmittedSlashCommand,
	RENAME_COMMAND,
	SESSIONS_COMMAND,
} from "./commands";

test("normalizes command input before matching", () => {
	expect(normalizeCommandInput("  ExIt  ")).toBe(EXIT_COMMAND);
});

test("matches the exit command case-insensitively", () => {
	expect(isExitCommand("exit")).toBe(true);
	expect(isExitCommand(" Exit ")).toBe(true);
	expect(isExitCommand("quit")).toBe(false);
});

test("matches ctrl+c as the exit shortcut", () => {
	expect(isExitShortcut({ name: "escape", ctrl: false })).toBe(false);
	expect(isExitShortcut({ name: "c", ctrl: true })).toBe(true);
	expect(isExitShortcut({ name: "c", ctrl: false })).toBe(false);
});

test("matches ctrl+n as the new-session shortcut", () => {
	expect(isNewSessionShortcut({ name: "n", ctrl: true })).toBe(true);
	expect(isNewSessionShortcut({ name: "n", ctrl: false })).toBe(false);
});

test("opens the slash menu only while the cursor is inside the leading token", () => {
	expect(getSlashMenuQuery("/model", 6)).toBe(MODEL_COMMAND);
	expect(getSlashMenuQuery("/model arg", 6)).toBe(MODEL_COMMAND);
	expect(getSlashMenuQuery("/model arg", 10)).toBeNull();
	expect(getSlashMenuQuery("hello /model", 12)).toBeNull();
});

test("matches slash commands by prefix before description text", () => {
	expect(getMatchingSlashCommands("m")[0]?.name).toBe(MODEL_COMMAND);
	expect(getMatchingSlashCommands("session")[0]?.name).toBe(SESSIONS_COMMAND);
});

test("supports session aliases and management commands", () => {
	expect(parseSubmittedSlashCommand("/session")?.command.name).toBe(
		SESSIONS_COMMAND,
	);
	expect(parseSubmittedSlashCommand("/rename now")?.command.name).toBe(
		RENAME_COMMAND,
	);
	expect(parseSubmittedSlashCommand("/delete")).toBeNull();
});

test("parses a submitted slash command from the first token", () => {
	expect(parseSubmittedSlashCommand(" /ExIt  ")?.command.name).toBe(
		EXIT_COMMAND,
	);
	expect(parseSubmittedSlashCommand("/new later")?.command.name).toBe(
		NEW_SESSION_COMMAND,
	);
	expect(parseSubmittedSlashCommand("hello")).toBeNull();
});

test("captures slash command arguments after the first token", () => {
	expect(parseSubmittedSlashCommand("/model gpt-5.4-mini")?.argumentText).toBe(
		"gpt-5.4-mini",
	);
});
