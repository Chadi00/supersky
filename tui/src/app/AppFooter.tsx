import { colors } from "../shared/theme";
import { appMetadata } from "./config";

type AppFooterProps = {
  isNewSession: boolean;
  projectLine: string;
  modelName: string | null;
  onMouseDown?: () => void;
};

export function AppFooter({
  isNewSession,
  projectLine,
  modelName,
  onMouseDown,
}: AppFooterProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Footer clicks return focus to the composer.
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      flexShrink={0}
      paddingX={2}
      paddingTop={isNewSession ? 1 : 0}
      paddingBottom={1}
      onMouseDown={() => {
        onMouseDown?.();
      }}
    >
      <text fg={colors.mutedText}>{projectLine}</text>
      <text>
        <span fg={colors.warningText}>{modelName ?? "No model"}</span>
        <span fg={colors.mutedText}> · </span>
        <span fg={colors.mutedText}>{appMetadata.version}</span>
      </text>
    </box>
  );
}
