import { colors } from "../shared/theme";
import { AssistantDemoOutput } from "./AssistantDemoOutput";

export function AssistantMessage() {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text fg={colors.successText}>Assistant</text>
      <AssistantDemoOutput />
    </box>
  );
}
