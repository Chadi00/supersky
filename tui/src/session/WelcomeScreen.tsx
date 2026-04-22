import type { RefObject } from "react";

import { colors } from "../shared/theme";
import { Composer, type ComposerHandle } from "./Composer";
import type { CommandPickerState } from "./commandPicker";

type WelcomeScreenProps = {
  bannerText: string;
  composerWidth: number;
  draft: string;
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
  composerRef: RefObject<ComposerHandle | null>;
  onSurfaceMouseDown: () => void;
  composerFocused: boolean;
};

export function WelcomeScreen({
  bannerText,
  composerWidth,
  draft,
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
  composerRef,
  onSurfaceMouseDown,
  composerFocused,
}: WelcomeScreenProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Welcome chrome clicks refocus the composer textarea.
    <box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      paddingBottom={2}
      onMouseDown={() => {
        onSurfaceMouseDown();
      }}
    >
      <box flexDirection="column" alignItems="center" gap={0} marginBottom={1}>
        <box height={7} justifyContent="center" alignItems="center">
          <ascii-font
            font="block"
            text={bannerText}
            color={colors.bannerText}
          />
        </box>
      </box>

      <Composer
        ref={composerRef}
        width={composerWidth}
        draft={draft}
        dismissComposerMenuToken={dismissComposerMenuToken}
        onComposerMenuOpenChange={onComposerMenuOpenChange}
        resetToken={resetToken}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        historyAvailable={historyAvailable}
        isBrowsingHistory={isBrowsingHistory}
        onHistoryPrevious={onHistoryPrevious}
        onHistoryNext={onHistoryNext}
        commandPickerState={commandPickerState}
        onCommandPickerClose={onCommandPickerClose}
        onCommandPickerSelect={onCommandPickerSelect}
        focused={composerFocused}
        minHeight={3}
      />
    </box>
  );
}
