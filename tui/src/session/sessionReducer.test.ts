import { expect, test } from "bun:test";

import type { BashExecutionMessage } from "../agent/bashExecutionTypes";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { AssistantMessage, UserMessage } from "../vendor/pi-ai/index.js";
import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState, type SessionState } from "./types";

function createUserMessage(text: string, timestamp: number): UserMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp,
	};
}

function createAssistantMessage(timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
	};
}

function createBashMessage(
	command: string,
	timestamp: number,
	excludeFromContext = false,
): BashExecutionMessage {
	return {
		role: "bashExecution",
		command,
		output: "",
		exitCode: 0,
		cancelled: false,
		truncated: false,
		timestamp,
		excludeFromContext,
	};
}

test("clears the draft and browsing state when a prompt is submitted", () => {
	const submittedMessage = createUserMessage("send on enter", 10);
	const nextState = sessionReducer(
		{
			...createInitialSessionState(),
			draft: "send on enter",
			historyIndex: 0,
			historyDraft: "older draft",
		},
		{ type: "promptSubmitted", message: submittedMessage },
	);

	expect(nextState.draft).toBe("");
	expect(nextState.pendingUserMessages).toEqual([submittedMessage]);
	expect(nextState.isStreaming).toBe(true);
	expect(nextState.historyIndex).toBeNull();
	expect(nextState.historyDraft).toBeNull();
	expect(nextState.composerResetToken).toBe(1);
});

test("clears pending user messages once the runtime transcript contains them", () => {
	const submittedMessage = createUserMessage("hello", 1);
	const assistantMessage = createAssistantMessage(2);
	const nextState = sessionReducer(
		{
			...createInitialSessionState(),
			pendingUserMessages: [submittedMessage],
			isStreaming: true,
		},
		{
			type: "runtimeStateReplaced",
			messages: [submittedMessage, assistantMessage],
			pendingBashMessages: [],
			streamingMessage: null,
			toolExecutions: [],
			isStreaming: false,
			errorMessage: null,
		},
	);

	expect(nextState.pendingUserMessages).toEqual([]);
	expect(nextState.messages).toEqual([submittedMessage, assistantMessage]);
});

test("replaces runtime-managed transcript state from the agent snapshot", () => {
	const messages: AgentMessage[] = [
		createUserMessage("hello", 1),
		createAssistantMessage(2),
	];

	const nextState = sessionReducer(createInitialSessionState(), {
		type: "runtimeStateReplaced",
		messages,
		pendingBashMessages: [],
		streamingMessage: null,
		toolExecutions: [],
		isStreaming: false,
		errorMessage: null,
	});

	expect(nextState.messages).toEqual(messages);
	expect(nextState.streamingMessage).toBeNull();
	expect(nextState.isStreaming).toBe(false);
	expect(nextState.errorMessage).toBeNull();
});

test("recalls the newest submitted user message and stashes the current draft", () => {
	const nextState = sessionReducer(
		{
			...createInitialSessionState(),
			draft: "draft in progress",
			messages: [
				createUserMessage("first prompt", 1),
				createAssistantMessage(2),
				createUserMessage("second prompt", 3),
				createAssistantMessage(4),
			],
		},
		{ type: "historyPrevious" },
	);

	expect(nextState.draft).toBe("second prompt");
	expect(nextState.historyIndex).toBe(1);
	expect(nextState.historyDraft).toBe("draft in progress");
});

test("moves forward through history before restoring the stashed draft", () => {
	const nextState = sessionReducer(
		{
			...createInitialSessionState(),
			draft: "first prompt",
			historyIndex: 0,
			historyDraft: "draft in progress",
			messages: [
				createUserMessage("first prompt", 1),
				createAssistantMessage(2),
				createUserMessage("second prompt", 3),
				createAssistantMessage(4),
			],
		},
		{ type: "historyNext" },
	);

	expect(nextState.draft).toBe("second prompt");
	expect(nextState.historyIndex).toBe(1);
	expect(nextState.historyDraft).toBe("draft in progress");
});

test("includes committed shell messages in composer history", () => {
	const nextState = sessionReducer(
		{
			...createInitialSessionState(),
			draft: "draft in progress",
			messages: [
				createUserMessage("first prompt", 1),
				createBashMessage("pwd", 2),
				createAssistantMessage(3),
				createBashMessage("git status", 4, true),
			],
		},
		{ type: "historyPrevious" },
	);

	expect(nextState.draft).toBe("!!git status");
	expect(nextState.historyIndex).toBe(2);
	expect(nextState.historyDraft).toBe("draft in progress");

	const olderState = sessionReducer(nextState, { type: "historyPrevious" });
	expect(olderState.draft).toBe("!pwd");
	expect(olderState.historyIndex).toBe(1);

	const restoredState = sessionReducer(nextState, { type: "historyNext" });
	expect(restoredState.draft).toBe("draft in progress");
	expect(restoredState.historyIndex).toBeNull();
	expect(restoredState.historyDraft).toBeNull();
});

test("resets the session while bumping the composer reset token", () => {
	const nextState = sessionReducer(
		{
			draft: "stale draft",
			composerResetToken: 2,
			historyIndex: 0,
			historyDraft: "work in progress",
			messages: [createUserMessage("hello", 1)],
			pendingBashMessages: [],
			pendingUserMessages: [],
			streamingMessage: createAssistantMessage(2),
			toolExecutions: [
				{
					toolCallId: "tool-1",
					toolName: "read",
					args: { path: "README.md" },
					status: "running",
				},
			],
			isStreaming: true,
			errorMessage: "boom",
		} satisfies SessionState,
		{ type: "sessionReset" },
	);

	expect(nextState).toEqual({
		...createInitialSessionState(),
		composerResetToken: 3,
	});
});
