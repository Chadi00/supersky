import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";

import { colors } from "../shared/theme";
import { composerKeyBindings } from "./commands";

const COMPOSER_MIN_HEIGHT = 3;
const COMPOSER_MAX_TEXT_LINES = 4;
const COMPOSER_VERTICAL_PADDING = 1;

type ComposerProps = {
  width: number | `${number}%`;
  draft: string;
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.plainText === draft) {
      return;
    }

    textarea.setText(draft);
    textarea.gotoBufferEnd();
  }, [draft]);

  const syncDraft = () => {
    const nextDraft = textareaRef.current?.plainText ?? "";

    if (nextDraft === draft) {
      return;
    }

    onDraftChange(nextDraft);
  };

  const submitDraft = () => {
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

    const lastLineIndex = Math.max(0, textarea.lineCount - 1);

    if (key.name === "up") {
      if (textarea.logicalCursor.row > 0) {
        return;
      }

      if (textarea.cursorOffset > 0) {
        key.preventDefault();
        key.stopPropagation();
        textarea.gotoBufferHome();
        return;
      }

      if (!historyAvailable) {
        return;
      }

      key.preventDefault();
      key.stopPropagation();
      onHistoryPrevious();
      return;
    }

    if (key.name === "down") {
      if (textarea.logicalCursor.row < lastLineIndex) {
        return;
      }

      if (textarea.cursorOffset < textarea.plainText.length) {
        key.preventDefault();
        key.stopPropagation();
        textarea.gotoBufferEnd();
        return;
      }

      if (!isBrowsingHistory) {
        return;
      }

      key.preventDefault();
      key.stopPropagation();
      onHistoryNext();
    }
  };

  return (
    <box flexDirection="column" width={width} maxWidth="100%" gap={0}>
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
    </box>
  );
}
