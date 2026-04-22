import { colors } from "../shared/theme";
import { appMetadata } from "./config";

type AppFooterProps = {
  isNewSession: boolean;
  projectLine: string;
  providerName: string | null;
  modelName: string | null;
};

export function AppFooter({
  isNewSession,
  projectLine,
  providerName,
  modelName,
}: AppFooterProps) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      flexShrink={0}
      paddingX={2}
      paddingTop={isNewSession ? 1 : 0}
      paddingBottom={1}
    >
      <text fg={colors.mutedText}>{projectLine}</text>
      <text>
        <span fg={colors.mutedText}>{providerName ?? "No provider"}</span>
        <span fg={colors.mutedText}> · </span>
        <span fg={colors.warningText}>{modelName ?? "No model"}</span>
        <span fg={colors.mutedText}> · </span>
        <span fg={colors.mutedText}>{appMetadata.version}</span>
      </text>
    </box>
  );
}
