import { colors } from "../shared/theme";
import { Composer } from "./Composer";

type WelcomeScreenProps = {
  composerWidth: number;
  draft: string;
  resetToken: number;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => void;
  historyAvailable: boolean;
  isBrowsingHistory: boolean;
  onHistoryPrevious: () => void;
  onHistoryNext: () => void;
};

export function WelcomeScreen({
  composerWidth,
  draft,
  resetToken,
  onDraftChange,
  onSubmit,
  historyAvailable,
  isBrowsingHistory,
  onHistoryPrevious,
  onHistoryNext,
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
          <ascii-font font="block" text="supersky" color={colors.bannerText} />
        </box>
      </box>

      <Composer
        width={composerWidth}
        draft={draft}
        resetToken={resetToken}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        historyAvailable={historyAvailable}
        isBrowsingHistory={isBrowsingHistory}
        onHistoryPrevious={onHistoryPrevious}
        onHistoryNext={onHistoryNext}
        focused
        minHeight={3}
      />
    </box>
  );
}
