import type { KeyBinding } from "@opentui/core";

export const LOGIN_COMMAND = "login";
export const LOGOUT_COMMAND = "logout";
export const MODEL_COMMAND = "model";
export const SETTINGS_COMMAND = "settings";
export const NEW_SESSION_COMMAND = "new";
export const EXIT_COMMAND = "exit";

export type SlashCommandName =
  | typeof LOGIN_COMMAND
  | typeof LOGOUT_COMMAND
  | typeof MODEL_COMMAND
  | typeof SETTINGS_COMMAND
  | typeof NEW_SESSION_COMMAND
  | typeof EXIT_COMMAND;

export type SlashCommand = {
  name: SlashCommandName;
  description: string;
};

export type SubmittedSlashCommand = {
  command: SlashCommand;
  argumentText: string;
};

const slashCommands: SlashCommand[] = [
  {
    name: LOGIN_COMMAND,
    description: "Connect a provider",
  },
  {
    name: LOGOUT_COMMAND,
    description: "Disconnect a provider",
  },
  {
    name: MODEL_COMMAND,
    description: "Change model",
  },
  {
    name: SETTINGS_COMMAND,
    description: "Open settings",
  },
  {
    name: NEW_SESSION_COMMAND,
    description: "Start a new session",
  },
  {
    name: EXIT_COMMAND,
    description: "Quit supersky",
  },
];

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

export function getSlashCommands() {
  return slashCommands;
}

export function findSlashCommand(name: string) {
  const normalized = normalizeCommandInput(name).replace(/^\//, "");
  const canonicalName = normalized === "provider" ? LOGIN_COMMAND : normalized;

  return (
    slashCommands.find((command) => command.name === canonicalName) ?? null
  );
}

export function getSlashMenuQuery(input: string, cursorOffset: number) {
  if (!input.startsWith("/") || cursorOffset <= 0) {
    return null;
  }

  const safeCursorOffset = Math.min(cursorOffset, input.length);
  const textBeforeCursor = input.slice(0, safeCursorOffset);

  if (/\s/.test(textBeforeCursor)) {
    return null;
  }

  return textBeforeCursor.slice(1);
}

export function getMatchingSlashCommands(query: string) {
  const normalizedQuery = normalizeCommandInput(query);
  if (!normalizedQuery) {
    return slashCommands;
  }

  return slashCommands
    .map((command, index) => {
      const slashName = `/${command.name}`;
      const prefixMatch = slashName.startsWith(`/${normalizedQuery}`);
      const includesMatch =
        prefixMatch ||
        slashName.includes(`/${normalizedQuery}`) ||
        command.description.toLowerCase().includes(normalizedQuery);

      if (!includesMatch) {
        return null;
      }

      return { command, index, prefixMatch };
    })
    .filter(
      (
        entry,
      ): entry is {
        command: SlashCommand;
        index: number;
        prefixMatch: boolean;
      } => entry !== null,
    )
    .sort((left, right) => {
      if (left.prefixMatch !== right.prefixMatch) {
        return left.prefixMatch ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.command);
}

export function parseSubmittedSlashCommand(input: string) {
  const trimmedInput = input.trim();
  const match = trimmedInput.match(/^\/([^\s]+)/);
  if (!match) {
    return null;
  }

  const commandName = match[1];
  if (!commandName) {
    return null;
  }

  const command = findSlashCommand(commandName);
  if (!command) {
    return null;
  }

  return {
    command,
    argumentText: trimmedInput.slice(match[0].length).trim(),
  } satisfies SubmittedSlashCommand;
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
