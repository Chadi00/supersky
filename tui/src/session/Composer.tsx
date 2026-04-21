import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { colors } from "../shared/theme";
import {
  composerKeyBindings,
  getMatchingSlashCommands,
  getSlashMenuQuery,
  replaceSlashCommandInput,
} from "./commands";

const COMPOSER_MIN_HEIGHT = 3;
const COMPOSER_MAX_TEXT_LINES = 4;
const COMPOSER_VERTICAL_PADDING = 1;
const COMMAND_MENU_MAX_ITEMS = 5;

type ComposerProps = {
  width: number | `${number}%`;
  draft: string;
  commandNotice: string | null;
  dismissSlashMenuToken: number;
  onSlashMenuOpenChange: (open: boolean) => void;
  resetToken: number;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => void;
  historyAvailable: boolean;
  isBrowsingHistory: boolean;
  onHistoryPrevious: () => void;
  onHistoryNext: () => void;
  focused: boolean;
  minHeight?: number;
  justifyContent?: "center" | "flex-end";
};

export function Composer({
  width,
  draft,
  commandNotice,
  dismissSlashMenuToken,
  onSlashMenuOpenChange,
  resetToken,
  onDraftChange,
  onSubmit,
  historyAvailable,
  isBrowsingHistory,
  onHistoryPrevious,
  onHistoryNext,
  focused,
  minHeight = COMPOSER_MIN_HEIGHT,
  justifyContent = "center",
}: ComposerProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null);
  const [slashMenuQuery, setSlashMenuQuery] = useState<string | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);

  const matchingSlashCommands = useMemo(
    () =>
      getMatchingSlashCommands(slashMenuQuery ?? "").slice(
        0,
        COMMAND_MENU_MAX_ITEMS,
      ),
    [slashMenuQuery],
  );
  const isSlashMenuOpen = slashMenuQuery !== null;

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

  const selectSlashCommand = () => {
    const textarea = textareaRef.current;
    const selectedSlashCommand =
      matchingSlashCommands[selectedSlashCommandIndex] ??
      matchingSlashCommands[0];
    if (!textarea || !selectedSlashCommand) {
      return;
    }

    const replacement = replaceSlashCommandInput(
      textarea.plainText,
      selectedSlashCommand.name,
    );

    textarea.setText(replacement.text);
    textarea.cursorOffset = replacement.cursorOffset;
    closeSlashMenu();
    onDraftChange(replacement.text);
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
    onSlashMenuOpenChange(isSlashMenuOpen);
  }, [isSlashMenuOpen, onSlashMenuOpenChange]);

  useEffect(() => {
    if (dismissSlashMenuToken === 0) {
      return;
    }

    setSlashMenuQuery(null);
    setSelectedSlashCommandIndex(0);
  }, [dismissSlashMenuToken]);

  const syncDraft = () => {
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
        const selectedSlashCommand =
          matchingSlashCommands[selectedSlashCommandIndex] ??
          matchingSlashCommands[0];
        const isExactSlashCommandMatch =
          key.name === "return" &&
          selectedSlashCommand !== undefined &&
          textarea.plainText.trim() === `/${selectedSlashCommand.name}`;

        if (isExactSlashCommandMatch) {
          closeSlashMenu();
          return;
        }

        key.preventDefault();
        key.stopPropagation();
        selectSlashCommand();
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
    <box flexDirection="column" width={width} maxWidth="100%" gap={0}>
      {isSlashMenuOpen ? (
        <box
          width="100%"
          flexDirection="column"
          backgroundColor={colors.commandMenuBackground}
          border
          borderColor={colors.commandMenuBorder}
        >
          {matchingSlashCommands.length > 0 ? (
            matchingSlashCommands.map((command, index) => {
              const selected = index === selectedSlashCommandIndex;

              return (
                <box
                  key={command.name}
                  flexDirection="row"
                  justifyContent="space-between"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={
                    selected
                      ? colors.commandMenuSelectedBackground
                      : colors.commandMenuBackground
                  }
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
                      selected ? colors.commandMenuSelectedText : colors.dimText
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
      ) : null}
      <box
        flexDirection="row"
        width="100%"
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

      {commandNotice ? (
        <box paddingLeft={1} paddingTop={0}>
          <text fg={colors.warningText}>{commandNotice}</text>
        </box>
      ) : null}
    </box>
  );
}
