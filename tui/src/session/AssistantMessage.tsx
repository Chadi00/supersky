import type { SuperskyToolDefinition } from "../agent/tools/types";
import { colors } from "../shared/theme";
import type { AgentToolResult } from "../vendor/pi-agent-core/index.js";
import type {
	AssistantMessage as AssistantMessageValue,
	TextContent,
	ThinkingContent,
	ToolCall,
	ToolResultMessage,
} from "../vendor/pi-ai/index.js";
import type { ToolExecutionState } from "./types";

type RenderableToolDefinition = Pick<
	SuperskyToolDefinition,
	"icon" | "formatCall"
>;

function getToolOutputText(
	result?: AgentToolResult<unknown> | ToolResultMessage,
) {
	if (!result) {
		return "";
	}

	const lines: string[] = [];
	for (const part of result.content) {
		if (part.type === "text") {
			lines.push(part.text);
			continue;
		}
		if (part.type === "image") {
			lines.push(`[image ${part.mimeType}]`);
		}
	}
	return lines.join("\n").trim();
}

function getPreviewText(text: string, maxLines = 10) {
	const lines = text.split("\n");
	if (lines.length <= maxLines) {
		return text;
	}
	return `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more lines)`;
}

function ToolExecutionRow(props: {
	toolCall: ToolCall;
	toolResult?: ToolResultMessage;
	liveExecution?: ToolExecutionState;
	toolDefinition?: RenderableToolDefinition;
	assistantError?: string;
}) {
	const title =
		props.toolDefinition?.formatCall(props.toolCall.arguments) ??
		props.toolCall.name;
	const liveResult = props.liveExecution?.result;
	const outputText = getToolOutputText(props.toolResult ?? liveResult);
	const status = props.toolResult
		? props.toolResult.isError
			? "error"
			: "completed"
		: (props.liveExecution?.status ?? "pending");
	const backgroundColor =
		status === "error"
			? colors.toolErrorBackground
			: status === "completed"
				? colors.toolSuccessBackground
				: colors.toolPendingBackground;
	const subtitle =
		status === "error"
			? (props.assistantError ?? "Error")
			: status === "completed"
				? "Completed"
				: "Running";

	return (
		<box
			flexDirection="column"
			marginTop={1}
			paddingX={1}
			paddingY={1}
			backgroundColor={backgroundColor}
			border={true}
			borderColor={colors.toolBorder}
		>
			<text fg={colors.foregroundText}>
				<span fg={colors.accentText}>{props.toolDefinition?.icon ?? "*"}</span>{" "}
				{title}
			</text>
			<text fg={colors.dimText}>{subtitle}</text>
			{outputText ? (
				<text fg={colors.foregroundText}>{getPreviewText(outputText)}</text>
			) : null}
		</box>
	);
}

export function AssistantMessage(props: {
	message: AssistantMessageValue;
	toolResultsByCallId: Map<string, ToolResultMessage>;
	liveToolExecutionsByCallId: Map<string, ToolExecutionState>;
	toolDefinitions: Record<string, RenderableToolDefinition>;
	isStreaming?: boolean;
}) {
	return (
		<box flexDirection="column" marginBottom={1}>
			<text fg={colors.assistantLabel}>
				Assistant · {props.message.provider}/{props.message.model}
				{props.isStreaming ? " · streaming" : ""}
			</text>

			<box flexDirection="column" paddingLeft={1}>
				{props.message.content.map((content) => {
					if (content.type === "text" && content.text.trim()) {
						const textContent = content as TextContent;
						return (
							<text
								key={`text-${textContent.textSignature ?? textContent.text.slice(0, 32)}`}
								fg={colors.foregroundText}
							>
								{textContent.text.trim()}
							</text>
						);
					}

					if (content.type === "thinking" && content.thinking.trim()) {
						const thinkingContent = content as ThinkingContent;
						return (
							<text
								key={`thinking-${thinkingContent.thinkingSignature ?? thinkingContent.thinking.slice(0, 32)}`}
								fg={colors.thinkingText}
							>
								Thinking: {thinkingContent.thinking.trim()}
							</text>
						);
					}

					if (content.type === "toolCall") {
						const toolCall = content as ToolCall;
						return (
							<ToolExecutionRow
								key={toolCall.id}
								toolCall={toolCall}
								toolResult={props.toolResultsByCallId.get(toolCall.id)}
								liveExecution={props.liveToolExecutionsByCallId.get(
									toolCall.id,
								)}
								toolDefinition={props.toolDefinitions[toolCall.name]}
								assistantError={props.message.errorMessage}
							/>
						);
					}

					return null;
				})}
			</box>

			{props.message.stopReason === "error" ||
			props.message.stopReason === "aborted" ? (
				<text fg={colors.warningText}>
					{props.message.errorMessage ||
						(props.message.stopReason === "aborted"
							? "Operation aborted"
							: "Unknown error")}
				</text>
			) : null}
		</box>
	);
}
