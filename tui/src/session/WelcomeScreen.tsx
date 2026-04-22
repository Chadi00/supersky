import { colors } from "../shared/theme";
import { Composer } from "./Composer";
import type { CommandPickerState } from "./commandPicker";

type WelcomeScreenProps = {
  bannerText: string;
  composerWidth: number;
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
};

export function WelcomeScreen({
  bannerText,
  composerWidth,
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
}: WelcomeScreenProps) {
  return (
    <box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      paddingBottom={2}
    >
      <box flexDirection="column" alignItems="center" gap={0} marginBottom={1}>
        <box height={7} justifyContent="center" alignItems="center">
          <ascii-font font="block" text={bannerText} color={colors.bannerText} />
        </box>
      </box>

      <Composer
        width={composerWidth}
        draft={draft}
        commandNotice={commandNotice}
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
        focused
        minHeight={3}
      />
    </box>
  );
}
