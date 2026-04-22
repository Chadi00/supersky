import type {
  KeyEvent,
  ScrollBoxRenderable,
  TextareaRenderable,
} from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { colors } from "../shared/theme";
import {
  type CommandPickerState,
  getCommandPickerRowId,
} from "./commandPicker";
import {
  composerKeyBindings,
  getMatchingSlashCommands,
  getSlashMenuQuery,
  type SlashCommand,
  type SlashCommandName,
} from "./commands";

const COMPOSER_MIN_HEIGHT = 3;
const COMPOSER_MAX_TEXT_LINES = 4;
const COMPOSER_VERTICAL_PADDING = 1;
const COMMAND_MENU_MAX_ITEMS = 10;
const COMMAND_MENU_Z_INDEX = 100;

function getCommandRowId(commandName: SlashCommandName) {
  return `slash-command-item-${commandName}`;
}

type SlashCommandMenuProps = {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (commandName: SlashCommandName) => void;
};

function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onExecute,
}: SlashCommandMenuProps) {
  const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);

  const visibleRows = Math.max(
    1,
    Math.min(commands.length, COMMAND_MENU_MAX_ITEMS),
  );

  useEffect(() => {
    const selectedCommand = commands[selectedIndex];
    if (!selectedCommand) {
      return;
    }

    scrollboxRef.current?.scrollChildIntoView(
      getCommandRowId(selectedCommand.name),
    );
  }, [commands, selectedIndex]);

  return (
    <box
      position="absolute"
      left={0}
      bottom="100%"
      width="100%"
      zIndex={COMMAND_MENU_Z_INDEX}
      overflow="visible"
    >
      <box
        width="100%"
        flexDirection="column"
        backgroundColor={colors.commandMenuBackground}
        border
        borderColor={colors.commandMenuBorder}
      >
        <scrollbox
          ref={scrollboxRef}
          height={visibleRows}
          focused={false}
          scrollX={false}
          style={{
            rootOptions: { backgroundColor: colors.commandMenuBackground },
            wrapperOptions: { backgroundColor: colors.commandMenuBackground },
            viewportOptions: { backgroundColor: colors.commandMenuBackground },
            contentOptions: { backgroundColor: colors.commandMenuBackground },
            scrollbarOptions: { visible: false },
            verticalScrollbarOptions: { visible: false },
            horizontalScrollbarOptions: { visible: false },
          }}
        >
          <box flexDirection="column">
            {commands.length > 0 ? (
              commands.map((command, index) => {
                const selected = index === selectedIndex;

                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive menu primitive here.
                  <box
                    key={command.name}
                    id={getCommandRowId(command.name)}
                    flexDirection="row"
                    justifyContent="space-between"
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={
                      selected
                        ? colors.commandMenuSelectedBackground
                        : colors.commandMenuBackground
                    }
                    onMouseMove={() => {
                      onSelect(index);
                    }}
                    onMouseDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onSelect(index);
                      onExecute(command.name);
                    }}
                  >
                    <text
                      fg={
                        selected
                          ? colors.commandMenuSelectedText
                          : colors.foregroundText
                      }
                    >
                      /{command.name}
                    </text>
                    <text
                      fg={
                        selected
                          ? colors.commandMenuSelectedText
                          : colors.dimText
                      }
                    >
                      {command.description}
                    </text>
                  </box>
                );
              })
            ) : (
              <box paddingLeft={1} paddingRight={1}>
                <text fg={colors.mutedText}>No matching commands</text>
              </box>
            )}
          </box>
        </scrollbox>
      </box>
    </box>
  );
}

type CommandPickerMenuProps = {
  picker: CommandPickerState;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: (itemId: string) => void;
};

function CommandPickerMenu({
  picker,
  selectedIndex,
  onSelect,
  onExecute,
}: CommandPickerMenuProps) {
  const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);

  const visibleRows = Math.max(
    1,
    Math.min(picker.items.length, COMMAND_MENU_MAX_ITEMS),
  );

  useEffect(() => {
    const selectedItem = picker.items[selectedIndex];
    if (!selectedItem) {
      return;
    }

    scrollboxRef.current?.scrollChildIntoView(
      getCommandPickerRowId(picker.kind, selectedItem.id),
    );
  }, [picker, selectedIndex]);

  return (
    <box
      position="absolute"
      left={0}
      bottom="100%"
      width="100%"
      zIndex={COMMAND_MENU_Z_INDEX}
      overflow="visible"
    >
      <box
        width="100%"
        flexDirection="column"
        backgroundColor={colors.commandMenuBackground}
        border
        borderColor={colors.commandMenuBorder}
      >
        <box
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
        >
          <text fg={colors.foregroundText}>{picker.title}</text>
          {picker.helperText ? (
            <text fg={colors.mutedText}>{picker.helperText}</text>
          ) : null}
        </box>
        <scrollbox
          ref={scrollboxRef}
          height={visibleRows}
          focused={false}
          scrollX={false}
          style={{
            rootOptions: { backgroundColor: colors.commandMenuBackground },
            wrapperOptions: { backgroundColor: colors.commandMenuBackground },
            viewportOptions: { backgroundColor: colors.commandMenuBackground },
            contentOptions: { backgroundColor: colors.commandMenuBackground },
            scrollbarOptions: { visible: false },
            verticalScrollbarOptions: { visible: false },
            horizontalScrollbarOptions: { visible: false },
          }}
        >
          <box flexDirection="column">
            {picker.items.length > 0 ? (
              picker.items.map((item, index) => {
                const selected = index === selectedIndex;

                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive menu primitive here.
                  <box
                    key={item.id}
                    id={getCommandPickerRowId(picker.kind, item.id)}
                    flexDirection="row"
                    justifyContent="space-between"
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={
                      selected
                        ? colors.commandMenuSelectedBackground
                        : colors.commandMenuBackground
                    }
                    onMouseMove={() => {
                      onSelect(index);
                    }}
                    onMouseDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onSelect(index);
                      onExecute(item.id);
                    }}
                  >
                    <text
                      fg={
                        selected
                          ? colors.commandMenuSelectedText
                          : colors.foregroundText
                      }
                    >
                      {item.label}
                    </text>
                    {item.meta ? (
                      <text
                        fg={
                          selected
                            ? colors.commandMenuSelectedText
                            : colors.dimText
                        }
                      >
                        {item.meta}
                      </text>
                    ) : (
                      <text>{""}</text>
                    )}
                  </box>
                );
              })
            ) : (
              <box paddingLeft={1} paddingRight={1}>
                <text fg={colors.mutedText}>{picker.emptyText}</text>
              </box>
            )}
          </box>
        </scrollbox>
      </box>
    </box>
  );
}

type ComposerProps = {
  width: number | `${number}%`;
  draft: string;
  commandNotice: string | null;
  dismissComposerMenuToken: number;
  onComposerMenuOpenChange: (open: boolean) => void;
  resetToken: number;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => void;
  historyAvailable: boolean;
  isBrowsingHistory: boolean;
  onHistoryPrevious: () => void;
  onHistoryNext: () => void;
  commandPickerState: CommandPickerState | null;
  onCommandPickerClose: () => void;
  onCommandPickerSelect: (itemId: string) => void;
  focused: boolean;
  minHeight?: number;
  justifyContent?: "center" | "flex-end";
};

export function Composer({
  width,
  draft,
  commandNotice,
  dismissComposerMenuToken,
  onComposerMenuOpenChange,
  resetToken,
  onDraftChange,
  onSubmit,
  historyAvailable,
  isBrowsingHistory,
  onHistoryPrevious,
  onHistoryNext,
  commandPickerState,
  onCommandPickerClose,
  onCommandPickerSelect,
  focused,
  minHeight = COMPOSER_MIN_HEIGHT,
  justifyContent = "center",
}: ComposerProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null);
  const [slashMenuQuery, setSlashMenuQuery] = useState<string | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [selectedCommandPickerIndex, setSelectedCommandPickerIndex] =
    useState(0);

  const matchingSlashCommands = useMemo(
    () => getMatchingSlashCommands(slashMenuQuery ?? ""),
    [slashMenuQuery],
  );
  const selectedSlashCommand =
    matchingSlashCommands[selectedSlashCommandIndex] ??
    matchingSlashCommands[0];
  const isSlashMenuOpen = slashMenuQuery !== null;
  const isCommandPickerOpen = commandPickerState !== null;
  const isComposerMenuOpen = isSlashMenuOpen || isCommandPickerOpen;

  const closeSlashMenu = () => {
    setSlashMenuQuery(null);
    setSelectedSlashCommandIndex(0);
  };

  const scheduleSlashMenuSync = () => {
    setTimeout(() => {
      updateSlashMenu();
    }, 0);
  };

  const updateSlashMenu = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      closeSlashMenu();
      return;
    }

    const nextSlashMenuQuery = getSlashMenuQuery(
      textarea.plainText,
      textarea.cursorOffset,
    );

    setSlashMenuQuery((currentQuery) => {
      if (currentQuery !== nextSlashMenuQuery) {
        setSelectedSlashCommandIndex(0);
      }

      return nextSlashMenuQuery;
    });
  };

  const executeSlashCommand = (commandName: SlashCommandName) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.clear();
    closeSlashMenu();
    onDraftChange("");
    onSubmit(`/${commandName}`);
  };

  const executeSelectedSlashCommand = () => {
    if (!selectedSlashCommand) {
      return;
    }

    executeSlashCommand(selectedSlashCommand.name);
  };

  const executeSelectedCommandPickerItem = () => {
    if (!commandPickerState) {
      return;
    }

    const selectedItem =
      commandPickerState.items[selectedCommandPickerIndex] ??
      commandPickerState.items[0];
    if (!selectedItem) {
      return;
    }

    onCommandPickerSelect(selectedItem.id);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    if (textarea.plainText !== draft) {
      textarea.setText(draft);
      textarea.gotoBufferEnd();
    }

    const nextSlashMenuQuery = getSlashMenuQuery(draft, draft.length);
    setSlashMenuQuery((currentQuery) => {
      if (currentQuery !== nextSlashMenuQuery) {
        setSelectedSlashCommandIndex(0);
      }

      return nextSlashMenuQuery;
    });
  }, [draft]);

  useEffect(() => {
    onComposerMenuOpenChange(isComposerMenuOpen);
  }, [isComposerMenuOpen, onComposerMenuOpenChange]);

  useEffect(() => {
    if (!commandPickerState) {
      setSelectedCommandPickerIndex(0);
      return;
    }

    const nextSelectedIndex = commandPickerState.selectedItemId
      ? commandPickerState.items.findIndex(
          (item) => item.id === commandPickerState.selectedItemId,
        )
      : -1;
    setSelectedCommandPickerIndex(
      nextSelectedIndex >= 0 ? nextSelectedIndex : 0,
    );
  }, [commandPickerState]);

  useEffect(() => {
    if (dismissComposerMenuToken === 0) {
      return;
    }

    setSlashMenuQuery(null);
    setSelectedSlashCommandIndex(0);
    setSelectedCommandPickerIndex(0);
    if (commandPickerState) {
      onCommandPickerClose();
    }
  }, [commandPickerState, dismissComposerMenuToken, onCommandPickerClose]);

  useKeyboard((key) => {
    if (!focused || key.name !== "escape" || !commandPickerState) {
      return;
    }

    onCommandPickerClose();
  });

  const syncDraft = () => {
    if (commandPickerState) {
      onCommandPickerClose();
      setSelectedCommandPickerIndex(0);
    }

    updateSlashMenu();
    const nextDraft = textareaRef.current?.plainText ?? "";

    if (nextDraft === draft) {
      return;
    }

    onDraftChange(nextDraft);
  };

  const submitDraft = () => {
    closeSlashMenu();
    const submitted = textareaRef.current?.plainText ?? draft;
    if (!submitted.trim()) {
      return;
    }

    textareaRef.current?.clear();
    onDraftChange("");
    onSubmit(submitted);
  };

  const handleKeyDown = (key: KeyEvent) => {
    const textarea = textareaRef.current;
    if (
      !textarea ||
      !focused ||
      key.ctrl ||
      key.shift ||
      key.meta ||
      key.super ||
      key.hyper
    ) {
      return;
    }

    if (isSlashMenuOpen) {
      if (commandPickerState) {
        return;
      }

      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        closeSlashMenu();
        return;
      }

      if (key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        setSelectedSlashCommandIndex((currentIndex) => {
          if (matchingSlashCommands.length === 0) {
            return 0;
          }

          return currentIndex === 0
            ? matchingSlashCommands.length - 1
            : currentIndex - 1;
        });
        return;
      }

      if (key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        setSelectedSlashCommandIndex((currentIndex) => {
          if (matchingSlashCommands.length === 0) {
            return 0;
          }

          return currentIndex >= matchingSlashCommands.length - 1
            ? 0
            : currentIndex + 1;
        });
        return;
      }

      if (
        matchingSlashCommands.length > 0 &&
        (key.name === "return" || key.name === "tab")
      ) {
        key.preventDefault();
        key.stopPropagation();
        executeSelectedSlashCommand();
        return;
      }
    }

    if (commandPickerState) {
      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        onCommandPickerClose();
        return;
      }

      if (key.name === "up") {
        key.preventDefault();
        key.stopPropagation();
        setSelectedCommandPickerIndex((currentIndex) => {
          if (commandPickerState.items.length === 0) {
            return 0;
          }

          return currentIndex === 0
            ? commandPickerState.items.length - 1
            : currentIndex - 1;
        });
        return;
      }

      if (key.name === "down") {
        key.preventDefault();
        key.stopPropagation();
        setSelectedCommandPickerIndex((currentIndex) => {
          if (commandPickerState.items.length === 0) {
            return 0;
          }

          return currentIndex >= commandPickerState.items.length - 1
            ? 0
            : currentIndex + 1;
        });
        return;
      }

      if (
        commandPickerState.items.length > 0 &&
        (key.name === "return" || key.name === "tab")
      ) {
        key.preventDefault();
        key.stopPropagation();
        executeSelectedCommandPickerItem();
        return;
      }
    }

    if (key.name === "left" || key.name === "right" || key.name === "home") {
      scheduleSlashMenuSync();
    }

    const lastLineIndex = Math.max(0, textarea.lineCount - 1);

    if (key.name === "up") {
      if (textarea.logicalCursor.row > 0) {
        scheduleSlashMenuSync();
        return;
      }

      if (textarea.cursorOffset > 0) {
        key.preventDefault();
        key.stopPropagation();
        textarea.gotoBufferHome();
        updateSlashMenu();
        return;
      }

      if (!historyAvailable) {
        scheduleSlashMenuSync();
        return;
      }

      key.preventDefault();
      key.stopPropagation();
      onHistoryPrevious();
      return;
    }

    if (key.name === "down") {
      if (textarea.logicalCursor.row < lastLineIndex) {
        scheduleSlashMenuSync();
        return;
      }

      if (textarea.cursorOffset < textarea.plainText.length) {
        key.preventDefault();
        key.stopPropagation();
        textarea.gotoBufferEnd();
        updateSlashMenu();
        return;
      }

      if (!isBrowsingHistory) {
        return;
      }

      key.preventDefault();
      key.stopPropagation();
      onHistoryNext();
      return;
    }

    if (key.name === "end") {
      scheduleSlashMenuSync();
    }
  };

  return (
    <box
      flexDirection="column"
      width={width}
      maxWidth="100%"
      gap={0}
      overflow="visible"
    >
      <box position="relative" width="100%" overflow="visible">
        {commandPickerState ? (
          <CommandPickerMenu
            picker={commandPickerState}
            selectedIndex={selectedCommandPickerIndex}
            onSelect={setSelectedCommandPickerIndex}
            onExecute={onCommandPickerSelect}
          />
        ) : null}
        {!commandPickerState && isSlashMenuOpen ? (
          <SlashCommandMenu
            commands={matchingSlashCommands}
            selectedIndex={selectedSlashCommandIndex}
            onSelect={setSelectedSlashCommandIndex}
            onExecute={executeSlashCommand}
          />
        ) : null}
        <box
          width="100%"
          flexDirection="row"
          minHeight={minHeight}
          alignItems="stretch"
        >
          <box
            flexGrow={1}
            flexDirection="column"
            backgroundColor={colors.composerBackground}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={COMPOSER_VERTICAL_PADDING}
            paddingBottom={COMPOSER_VERTICAL_PADDING}
            minHeight={minHeight}
            justifyContent={justifyContent}
          >
            <textarea
              key={resetToken}
              ref={textareaRef}
              focused={focused}
              placeholderColor={colors.mutedText}
              initialValue={draft}
              minHeight={1}
              maxHeight={COMPOSER_MAX_TEXT_LINES}
              backgroundColor={colors.composerBackground}
              textColor={colors.foregroundText}
              focusedBackgroundColor={colors.composerBackground}
              focusedTextColor={colors.foregroundText}
              wrapMode="word"
              keyBindings={composerKeyBindings}
              onKeyDown={handleKeyDown}
              onContentChange={syncDraft}
              onSubmit={submitDraft}
            />
          </box>
        </box>
      </box>

      {commandNotice ? (
        <box paddingLeft={1} paddingTop={0}>
          <text fg={colors.warningText}>{commandNotice}</text>
        </box>
      ) : null}
    </box>
  );
}
