import type { BashExecutionMessage } from "../agent/bashExecutionTypes";
import type {
	AgentMessage,
	AgentToolResult,
} from "../vendor/pi-agent-core/index.js";
import type {
	AssistantMessage,
	TextContent,
	ToolResultMessage,
	UserMessage,
} from "../vendor/pi-ai/index.js";

export type ToolExecutionStatus = "pending" | "running" | "completed" | "error";

export type ToolExecutionState = {
	toolCallId: string;
	toolName: string;
	args: unknown;
	status: ToolExecutionStatus;
	result?: AgentToolResult<unknown>;
	isError?: boolean;
};

export type SessionState = {
	draft: string;
	messages: AgentMessage[];
	/** Composer `!` / `!!` shell runs waiting to merge into the transcript after the current model turn. */
	pendingBashMessages: BashExecutionMessage[];
	pendingUserMessages: UserMessage[];
	streamingMessage: AssistantMessage | null;
	toolExecutions: ToolExecutionState[];
	isStreaming: boolean;
	errorMessage: string | null;
	composerResetToken: number;
	historyIndex: number | null;
	historyDraft: string | null;
};

function userMessageText(message: UserMessage) {
	if (typeof message.content === "string") {
		return message.content;
	}
	return message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

export function getSubmittedUserMessages(messages: AgentMessage[]) {
	return messages.filter(
		(message): message is UserMessage => message.role === "user",
	);
}

export function getUserMessageText(message: UserMessage) {
	return userMessageText(message);
}

export function isToolResultMessage(
	message: AgentMessage,
): message is ToolResultMessage {
	return message.role === "toolResult";
}

export function createInitialSessionState(): SessionState {
	return {
		draft: "",
		messages: [],
		pendingBashMessages: [],
		pendingUserMessages: [],
		streamingMessage: null,
		toolExecutions: [],
		isStreaming: false,
		errorMessage: null,
		composerResetToken: 0,
		historyIndex: null,
		historyDraft: null,
	};
}
