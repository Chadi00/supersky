import type { TextareaRenderable } from "@opentui/core";
import { useRef } from "react";

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
  focused,
  minHeight = COMPOSER_MIN_HEIGHT,
  justifyContent = "center",
}: ComposerProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null);

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
            onContentChange={syncDraft}
            onSubmit={submitDraft}
          />
        </box>
      </box>
    </box>
  );
}
