import { expect, spyOn, test } from "bun:test";

import * as piAi from "../vendor/pi-ai/index.js";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { AssistantMessage } from "../vendor/pi-ai/index.js";
import type { Api, Model } from "./providerState/piSource";
import {
	buildRuntimeContextMessages,
	compactSession,
	buildTranscriptMessagesFromRuntime,
	createCompactionSummaryMessage,
	getCompactionBoundaryIndex,
	type SessionCompactionState,
	truncateCompactionState,
} from "./compaction";

function user(text: string, timestamp: number): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp,
	};
}

function assistant(text: string, timestamp: number): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "test",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp,
	};
}

function bash(
	command: string,
	output: string,
	timestamp: number,
	excludeFromContext = false,
): AgentMessage {
	return {
		role: "bashExecution",
		command,
		output,
		exitCode: 0,
		cancelled: false,
		truncated: false,
		timestamp,
		excludeFromContext,
	};
}

function createModel(contextWindow = 4_000): Model<Api> {
	return {
		id: "test-model",
		name: "Test Model",
		api: "openai-responses",
		provider: "test",
		baseUrl: "https://example.test",
		reasoning: true,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow,
		maxTokens: 4096,
	};
}

function assistantReply(text: string, timestamp: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "test",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp,
	};
}

test("buildRuntimeContextMessages prepends the synthetic summary and keeps only the tail", () => {
	const transcript = [
		user("first", 1),
		assistant("reply one", 2),
		user("second", 3),
		assistant("reply two", 4),
	];
	const compaction: SessionCompactionState = {
		summary: "## Goal\n- Keep recent work",
		firstKeptMessageIndex: 2,
		transcriptBoundaryIndex: 4,
		timestamp: 10,
		tokensBefore: 120,
	};

	const runtime = buildRuntimeContextMessages({
		messages: transcript,
		compaction,
	});

	expect(runtime).toHaveLength(3);
	expect(runtime[0]).toEqual(createCompactionSummaryMessage(compaction));
	expect(runtime.slice(1)).toEqual(transcript.slice(2));
	expect(getCompactionBoundaryIndex(compaction, transcript.length)).toBe(4);
});

test("buildTranscriptMessagesFromRuntime reconstructs the full transcript after a turn", () => {
	const transcript = [
		user("first", 1),
		assistant("reply one", 2),
		user("second", 3),
		assistant("reply two", 4),
	];
	const compaction: SessionCompactionState = {
		summary: "## Goal\n- Keep recent work",
		firstKeptMessageIndex: 2,
		timestamp: 10,
		tokensBefore: 120,
	};
	const nextRuntime = [
		createCompactionSummaryMessage(compaction),
		...transcript.slice(2),
		user("third", 5),
		assistant("reply three", 6),
	];

	const nextTranscript = buildTranscriptMessagesFromRuntime({
		transcriptMessages: transcript,
		runtimeMessages: nextRuntime,
		compaction,
	});

	expect(nextTranscript).toEqual([
		...transcript,
		user("third", 5),
		assistant("reply three", 6),
	]);
});

test("truncateCompactionState clears compaction once the boundary is no longer valid", () => {
	const compaction: SessionCompactionState = {
		summary: "## Goal\n- Keep recent work",
		firstKeptMessageIndex: 2,
		timestamp: 10,
		tokensBefore: 120,
	};

	expect(truncateCompactionState(compaction, 4)).toEqual(compaction);
	expect(truncateCompactionState(compaction, 2)).toBeNull();
	expect(truncateCompactionState(compaction, 1)).toBeNull();
});

test("compactSession omits excluded shell output from the compaction prompt", async () => {
	const secretOutput = "token=shh-123";
	const promptContexts: string[] = [];
	const completeSimpleSpy = spyOn(piAi, "completeSimple").mockImplementation(
		async (_model, context) => {
			const prompt = context.messages[0];
			if (prompt?.role === "user" && Array.isArray(prompt.content)) {
				promptContexts.push(
					prompt.content
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n"),
				);
			}

			return assistantReply("## Goal\n- Keep shipping", 99);
		},
	);

	try {
		const transcript = [
			user("alpha ".repeat(1000), 1),
			assistant("reply alpha ".repeat(1000), 2),
			bash("print-secret", secretOutput, 3, true),
			user("beta ".repeat(1000), 4),
			assistant("reply beta ".repeat(1000), 5),
			user("gamma ".repeat(1000), 6),
			assistant("reply gamma ".repeat(1000), 7),
		];

		const result = await compactSession({
			model: createModel(),
			authStorage: {
				getApiKeyAsync: async () => undefined,
			},
			sessionId: "session-1",
			transcriptMessages: transcript,
			compaction: null,
			thinkingLevel: "medium",
		});

		expect(result).not.toBeNull();
		expect(promptContexts).toHaveLength(1);
		expect(promptContexts[0]).not.toContain(secretOutput);
		expect(promptContexts[0]).not.toContain("print-secret");
	} finally {
		completeSimpleSpy.mockRestore();
	}
});
