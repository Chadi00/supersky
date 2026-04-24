import { expect, test } from "bun:test";

import type { AssistantMessage, UserMessage } from "../vendor/pi-ai/index.js";
import type { Api, Model } from "./providerState/piSource";
import {
	buildRuntimeContextMessages,
	createCompactionSummaryMessage,
} from "./compaction";
import {
	buildSessionSidebarUsageLines,
	estimateContextTokens,
	estimateTokens,
} from "./contextUsageDisplay";

function createModel(contextWindow: number): Model<Api> {
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

function user(text: string, timestamp: number): UserMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp,
	};
}

function assistant(
	text: string,
	timestamp: number,
	totalTokens: number,
	totalCost = 0,
): AssistantMessage {
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
			totalTokens,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: totalCost,
			},
		},
		stopReason: "stop",
		timestamp,
	};
}

test("estimateContextTokens ignores stale pre-compaction assistant usage", () => {
	const messages = [
		createCompactionSummaryMessage({
			summary: "## Goal\n- Ship the feature",
			firstKeptMessageIndex: 10,
			timestamp: 100,
			tokensBefore: 12_000,
		}),
		user("recent question", 50),
		assistant("recent answer", 90, 12_000),
	];

	const estimate = estimateContextTokens(messages);
	const expected = messages.reduce(
		(total, message) => total + estimateTokens(message),
		0,
	);

	expect(estimate.tokens).toBe(expected);
	expect(estimate.lastUsageIndex).toBeNull();
});

test("estimateContextTokens uses fresh post-compaction assistant usage", () => {
	const summary = createCompactionSummaryMessage({
		summary: "## Goal\n- Ship the feature",
		firstKeptMessageIndex: 1,
		timestamp: Date.now(),
		tokensBefore: 500,
	});
	const messages = [
		summary,
		user("next step", summary.timestamp + 1),
		assistant("done", summary.timestamp + 2, 321),
	];

	const estimate = estimateContextTokens(messages);

	expect(estimate.tokens).toBe(321);
	expect(estimate.lastUsageIndex).toBe(2);
});

test("estimateContextTokens ignores zero-valued assistant usage", () => {
	const messages = [user("pending request", 1), assistant("ok", 2, 0)];

	const estimate = estimateContextTokens(messages);
	const expected = messages.reduce(
		(total, message) => total + estimateTokens(message),
		0,
	);

	expect(estimate.tokens).toBe(expected);
	expect(estimate.lastUsageIndex).toBeNull();
});

test("buildSessionSidebarUsageLines ignores streaming partials for context", () => {
	const model = createModel(1000);
	const messages = [user("prompt", 1), assistant("done", 2, 321)];
	const streaming = assistant("x".repeat(400), 3, 0);

	expect(
		buildSessionSidebarUsageLines(model, messages, messages, streaming, false),
	).toEqual(["321 tokens", "32.1% used", "$0.000 spent"]);
});

test("buildSessionSidebarUsageLines keeps spend from the full transcript", () => {
	const model = createModel(1000);
	const contextMessages = [user("fresh request", 1)];
	const costMessages = [user("older request", 1), assistant("done", 2, 321, 1.234)];

	expect(
		buildSessionSidebarUsageLines(
			model,
			contextMessages,
			costMessages,
			null,
			false,
		),
	).toEqual(["4 tokens", "0.4% used", "$1.234 spent"]);
});

test("compacted runtime context estimates fewer tokens than the full transcript", () => {
	const longText = "x".repeat(400);
	const transcript = [
		user(longText, 1),
		assistant(longText, 2, 0),
		user(longText, 3),
		assistant(longText, 4, 0),
	];
	const compacted = buildRuntimeContextMessages({
		messages: transcript,
		compaction: {
			summary: "short summary",
			firstKeptMessageIndex: 2,
			timestamp: 10,
			tokensBefore: estimateContextTokens(transcript).tokens,
		},
	});

	expect(estimateContextTokens(compacted).tokens).toBeLessThan(
		estimateContextTokens(transcript).tokens,
	);
});
