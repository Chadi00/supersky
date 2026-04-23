import type { BashExecutionMessage } from "../agent/bashExecutionTypes";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { AssistantMessage, UserMessage } from "../vendor/pi-ai/index.js";
import {
	createInitialSessionState,
	getComposerHistoryText,
	getSubmittedComposerHistory,
	getUserMessageText,
	type SessionState,
	type ToolExecutionState,
} from "./types";

export type SessionAction =
	| { type: "draftChanged"; value: string }
	| { type: "historyPrevious"; committedMessages?: AgentMessage[] }
	| { type: "historyNext"; committedMessages?: AgentMessage[] }
	| { type: "promptSubmitted"; message: UserMessage }
	| {
			type: "runtimeStateReplaced";
			messages: AgentMessage[];
			pendingBashMessages?: BashExecutionMessage[];
			streamingMessage: AssistantMessage | null;
			toolExecutions: ToolExecutionState[];
			isStreaming: boolean;
			errorMessage: string | null;
	  }
	| { type: "sessionReset" };

function hasMatchingUserMessage(
	messages: AgentMessage[],
	candidate: UserMessage,
) {
	return messages.some(
		(message) =>
			message.role === "user" &&
			message.timestamp === candidate.timestamp &&
			getUserMessageText(message) === getUserMessageText(candidate),
	);
}

export function sessionReducer(
	state: SessionState,
	action: SessionAction,
): SessionState {
	switch (action.type) {
		case "draftChanged": {
			if (state.draft === action.value) {
				return state;
			}

			return {
				...state,
				draft: action.value,
			};
		}

		case "historyPrevious": {
			const historyEntries = getSubmittedComposerHistory([
				...(action.committedMessages ?? state.messages),
				...state.pendingBashMessages,
				...state.pendingUserMessages,
			]);
			if (historyEntries.length === 0) {
				return state;
			}

			const nextHistoryIndex =
				state.historyIndex === null
					? historyEntries.length - 1
					: Math.max(0, state.historyIndex - 1);
			const nextHistoryDraft =
				state.historyIndex === null ? state.draft : state.historyDraft;
			const nextMessage = historyEntries[nextHistoryIndex];
			const nextDraft = nextMessage
				? getComposerHistoryText(nextMessage)
				: state.draft;

			if (
				state.historyIndex === nextHistoryIndex &&
				state.historyDraft === nextHistoryDraft &&
				state.draft === nextDraft
			) {
				return state;
			}

			return {
				...state,
				draft: nextDraft,
				historyIndex: nextHistoryIndex,
				historyDraft: nextHistoryDraft,
			};
		}

		case "historyNext": {
			if (state.historyIndex === null) {
				return state;
			}

			const historyEntries = getSubmittedComposerHistory([
				...(action.committedMessages ?? state.messages),
				...state.pendingBashMessages,
				...state.pendingUserMessages,
			]);
			if (historyEntries.length === 0) {
				return state;
			}

			if (state.historyIndex >= historyEntries.length - 1) {
				return {
					...state,
					draft: state.historyDraft ?? "",
					historyIndex: null,
					historyDraft: null,
				};
			}

			const nextHistoryIndex = state.historyIndex + 1;
			const nextMessage = historyEntries[nextHistoryIndex];

			return {
				...state,
				draft: nextMessage ? getComposerHistoryText(nextMessage) : state.draft,
				historyIndex: nextHistoryIndex,
			};
		}

		case "promptSubmitted": {
			return {
				...state,
				draft: "",
				pendingUserMessages: [...state.pendingUserMessages, action.message],
				streamingMessage: null,
				isStreaming: true,
				errorMessage: null,
				composerResetToken: state.composerResetToken + 1,
				historyIndex: null,
				historyDraft: null,
			};
		}

		case "runtimeStateReplaced": {
			const pendingUserMessages = state.pendingUserMessages.filter(
				(message) => !hasMatchingUserMessage(action.messages, message),
			);

			return {
				...state,
				messages: action.messages,
				pendingBashMessages: action.pendingBashMessages ?? [],
				pendingUserMessages,
				streamingMessage: action.streamingMessage,
				toolExecutions: action.toolExecutions,
				isStreaming: action.isStreaming,
				errorMessage: action.errorMessage,
			};
		}

		case "sessionReset": {
			return {
				...createInitialSessionState(),
				composerResetToken: state.composerResetToken + 1,
			};
		}
	}
}
