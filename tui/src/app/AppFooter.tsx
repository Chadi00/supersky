import { colors } from "../shared/theme";
import { appMetadata } from "./config";

type AppFooterProps = {
  isNewSession: boolean;
};

export function AppFooter({ isNewSession }: AppFooterProps) {
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
      <text fg={colors.mutedText}>{appMetadata.projectLine}</text>
      <text>
        <span fg={colors.mutedText}>{appMetadata.modelName}</span>
        <span fg={colors.mutedText}> · </span>
        <span fg={colors.warningText}>{appMetadata.modelQuality}</span>
        <span fg={colors.mutedText}> · </span>
        <span fg={colors.mutedText}>{appMetadata.version}</span>
      </text>
    </box>
  );
}
