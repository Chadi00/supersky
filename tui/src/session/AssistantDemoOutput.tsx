import { assistantDemoSummary } from "../app/config";
import { colors } from "../shared/theme";

export function AssistantDemoOutput() {
  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      <text>
        <span fg={colors.successText}>==== OpenTUI Task Complete ====</span>
      </text>
      <text fg={colors.dimText}> </text>
      <text fg={colors.foregroundText}>
        <span fg={colors.accentText}>Framework:</span>{" "}
        {assistantDemoSummary.framework}
      </text>
      <text fg={colors.foregroundText}>
        <span fg={colors.accentText}>What I changed:</span>{" "}
        {assistantDemoSummary.changeSummary}
      </text>
      <text fg={colors.foregroundText}>
        <span fg={colors.accentText}>Main files:</span>{" "}
        <span fg={colors.successText}>
          {assistantDemoSummary.mainFiles.join(", ")}
        </span>
      </text>
      <text fg={colors.foregroundText}>
        <span fg={colors.accentText}>Verification:</span>{" "}
        <span fg={colors.verificationText}>
          {assistantDemoSummary.verificationCommand}
        </span>
      </text>
    </box>
  );
}
