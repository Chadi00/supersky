import { colors } from "../shared/theme";
import { Composer } from "./Composer";

type WelcomeScreenProps = {
  composerWidth: number;
  draft: string;
  resetToken: number;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function WelcomeScreen({
  composerWidth,
  draft,
  resetToken,
  onDraftChange,
  onSubmit,
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
          <box flexDirection="column" alignItems="center" gap={0}>
            <text fg={colors.bannerText}>
              {" "}
              ___ _ _ _ __ ___ _ __ ___| | ___ _
            </text>
            <text fg={colors.bannerText}>
              / __| | | | '_ \ / _ \ '__/ __| |/ / | | |
            </text>
            <text fg={colors.bannerText}>
              \__ \ |_| | |_) | __/ | \__ \ &lt;| |_| |
            </text>
            <text fg={colors.bannerText}>
              |___/\__,_| .__/ \___|_| |___/_|\_\\__, |
            </text>
            <text fg={colors.bannerText}> |_| |___/ </text>
          </box>
        </box>
      </box>

      <Composer
        width={composerWidth}
        draft={draft}
        resetToken={resetToken}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        focused
        minHeight={3}
      />
    </box>
  );
}
