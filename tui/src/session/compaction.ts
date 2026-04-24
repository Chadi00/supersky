import type {
	AgentMessage,
	ThinkingLevel,
} from "../vendor/pi-agent-core/index.js";
import {
	type AssistantMessage,
	completeSimple,
	type Model,
} from "../vendor/pi-ai/index.js";
import { supportsXhigh } from "../vendor/pi-ai/models.js";
import { estimateContextTokens, estimateTokens } from "./contextUsageDisplay";
import type { Api } from "./providerState/piSource";

export interface SessionCompactionState {
	summary: string;
	firstKeptMessageIndex: number;
	transcriptBoundaryIndex?: number;
	timestamp: number;
	tokensBefore: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	timestamp: number;
	tokensBefore: number;
}

declare module "../vendor/pi-agent-core/types.js" {
	interface CustomAgentMessages {
		compactionSummary: CompactionSummaryMessage;
	}
}

const DEFAULT_TAIL_TURNS = 2;
const MIN_PRESERVE_RECENT_TOKENS = 2_000;
const MAX_PRESERVE_RECENT_TOKENS = 8_000;
const SUMMARY_TEMPLATE = `Output exactly this Markdown structure and keep the section order unchanged:
---
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
---

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;

type Turn = {
	start: number;
	end: number;
};

type TailSelection = {
	hiddenMessages: AgentMessage[];
	tailMessages: AgentMessage[];
};

function extractAssistantText(message: AssistantMessage) {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function preserveRecentBudget(model: Model<Api>) {
	return Math.min(
		MAX_PRESERVE_RECENT_TOKENS,
		Math.max(
			MIN_PRESERVE_RECENT_TOKENS,
			Math.floor((model.contextWindow ?? 0) * 0.25),
		),
	);
}

function turns(messages: AgentMessage[]) {
	const result: Turn[] = [];
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (!message || message.role !== "user") {
			continue;
		}
		result.push({ start: index, end: messages.length });
	}

	for (let index = 0; index < result.length - 1; index += 1) {
		const current = result[index];
		const next = result[index + 1];
		if (current && next) {
			current.end = next.start;
		}
	}

	return result;
}

function sumEstimatedTokens(messages: AgentMessage[]) {
	let total = 0;
	for (const message of messages) {
		total += estimateTokens(message);
	}
	return total;
}

function selectTail(
	messages: AgentMessage[],
	model: Model<Api>,
): TailSelection | null {
	const allTurns = turns(messages);
	if (allTurns.length === 0) {
		return null;
	}

	const budget = preserveRecentBudget(model);
	const recentTurns = allTurns.slice(-DEFAULT_TAIL_TURNS);
	let total = 0;
	let keepIndex: number | undefined;

	for (let index = recentTurns.length - 1; index >= 0; index -= 1) {
		const turn = recentTurns[index];
		if (!turn) {
			continue;
		}

		const size = sumEstimatedTokens(messages.slice(turn.start, turn.end));
		if (keepIndex === undefined) {
			keepIndex = turn.start;
			total += size;
			continue;
		}

		if (total + size > budget) {
			break;
		}

		total += size;
		keepIndex = turn.start;
	}

	if (keepIndex === undefined || keepIndex <= 0) {
		return null;
	}

	return {
		hiddenMessages: messages.slice(0, keepIndex),
		tailMessages: messages.slice(keepIndex),
	};
}

function serializeMessage(message: AgentMessage) {
	if (message.role === "user") {
		if (typeof message.content === "string") {
			return `[User]\n${message.content}`;
		}
		const text = message.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
		return `[User]\n${text}`;
	}

	if (message.role === "assistant") {
		const lines: string[] = [];
		for (const part of message.content) {
			if (part.type === "thinking" && part.thinking.trim()) {
				lines.push(`[Assistant thinking]\n${part.thinking.trim()}`);
				continue;
			}
			if (part.type === "text" && part.text.trim()) {
				lines.push(`[Assistant]\n${part.text.trim()}`);
				continue;
			}
			if (part.type === "toolCall") {
				lines.push(
					`[Tool call ${part.name}]\n${JSON.stringify(part.arguments, null, 2)}`,
				);
			}
		}
		return lines.join("\n\n");
	}

	if (message.role === "toolResult") {
		const output = message.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n")
			.trim();
		return `[Tool result ${message.toolName}]\n${output}`;
	}

	if (message.role === "bashExecution") {
		if (message.excludeFromContext) {
			return "";
		}

		return `[Shell]\n$ ${message.command}\n${message.output}`;
	}

	if (message.role === "compactionSummary") {
		return `[Previous summary]\n${message.summary}`;
	}

	return "";
}

function buildPrompt(
	previousSummary: string | undefined,
	hiddenMessages: AgentMessage[],
) {
	const context = hiddenMessages
		.map(serializeMessage)
		.filter(Boolean)
		.join("\n\n");

	const anchor = previousSummary
		? [
				"Update the anchored summary below using the conversation history above.",
				"Preserve still-true details, remove stale details, and merge in the new facts.",
				"<previous-summary>",
				previousSummary,
				"</previous-summary>",
			].join("\n")
		: "Create a new anchored summary from the conversation history above.";

	return [anchor, SUMMARY_TEMPLATE, context].join("\n\n");
}

function effectiveReasoning(model: Model<Api>, thinkingLevel: ThinkingLevel) {
	if (!model.reasoning || thinkingLevel === "off") {
		return undefined;
	}

	if (thinkingLevel === "xhigh" && !supportsXhigh(model)) {
		return "high" as const;
	}

	return thinkingLevel;
}

export function isCompactionSummaryMessage(
	message: AgentMessage,
): message is CompactionSummaryMessage {
	return message.role === "compactionSummary";
}

export function createCompactionSummaryMessage(
	compaction: SessionCompactionState,
) {
	return {
		role: "compactionSummary",
		summary: compaction.summary,
		timestamp: compaction.timestamp,
		tokensBefore: compaction.tokensBefore,
	} satisfies CompactionSummaryMessage;
}

export function getVisibleTranscriptMessages(messages: AgentMessage[]) {
	return messages.filter((message) => !isCompactionSummaryMessage(message));
}

export function getEffectiveCompactionState(
	compaction: SessionCompactionState | null | undefined,
	messageCount: number,
) {
	if (!compaction) {
		return null;
	}

	if (
		compaction.firstKeptMessageIndex <= 0 ||
		compaction.firstKeptMessageIndex >= messageCount
	) {
		return null;
	}

	return compaction;
}

export function getCompactionBoundaryIndex(
	compaction: SessionCompactionState | null | undefined,
	messageCount: number,
) {
	const effectiveCompaction = getEffectiveCompactionState(
		compaction,
		messageCount,
	);
	if (!effectiveCompaction) {
		return null;
	}

	const transcriptBoundaryIndex = effectiveCompaction.transcriptBoundaryIndex;
	if (
		typeof transcriptBoundaryIndex === "number" &&
		transcriptBoundaryIndex > 0 &&
		transcriptBoundaryIndex <= messageCount
	) {
		return transcriptBoundaryIndex;
	}

	return effectiveCompaction.firstKeptMessageIndex;
}

export function truncateCompactionState(
	compaction: SessionCompactionState | null | undefined,
	messageCount: number,
) {
	return getEffectiveCompactionState(compaction, messageCount);
}

export function buildRuntimeContextMessages(options: {
	messages: AgentMessage[];
	compaction: SessionCompactionState | null | undefined;
}) {
	const compaction = getEffectiveCompactionState(
		options.compaction,
		options.messages.length,
	);
	if (!compaction) {
		return options.messages.slice();
	}

	return [
		createCompactionSummaryMessage(compaction),
		...options.messages.slice(compaction.firstKeptMessageIndex),
	] satisfies AgentMessage[];
}

export function buildTranscriptMessagesFromRuntime(options: {
	transcriptMessages: AgentMessage[];
	runtimeMessages: AgentMessage[];
	compaction: SessionCompactionState | null | undefined;
}) {
	const visibleRuntimeMessages = getVisibleTranscriptMessages(
		options.runtimeMessages,
	);
	const compaction = getEffectiveCompactionState(
		options.compaction,
		options.transcriptMessages.length,
	);
	if (!compaction) {
		return visibleRuntimeMessages;
	}

	return [
		...options.transcriptMessages.slice(0, compaction.firstKeptMessageIndex),
		...visibleRuntimeMessages,
	] satisfies AgentMessage[];
}

export async function compactSession(options: {
	model: Model<Api>;
	authStorage: {
		getApiKeyAsync(provider: string): Promise<string | undefined>;
	};
	sessionId: string;
	transcriptMessages: AgentMessage[];
	compaction: SessionCompactionState | null;
	thinkingLevel: ThinkingLevel;
}) {
	const currentCompaction = getEffectiveCompactionState(
		options.compaction,
		options.transcriptMessages.length,
	);
	const boundaryStart = currentCompaction?.firstKeptMessageIndex ?? 0;
	const uncompressedMessages = options.transcriptMessages.slice(boundaryStart);
	const selection = selectTail(uncompressedMessages, options.model);
	if (!selection) {
		return null;
	}

	const previousSummary = currentCompaction?.summary;
	const prompt = buildPrompt(previousSummary, selection.hiddenMessages);
	const apiKey = await options.authStorage.getApiKeyAsync(
		options.model.provider,
	);
	const response = await completeSimple(
		options.model,
		{
			systemPrompt:
				"You create compact, anchored markdown summaries for coding sessions.",
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: prompt }],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey,
			cacheRetention: "none",
			maxTokens: Math.min(4_096, options.model.maxTokens ?? 4_096),
			reasoning: effectiveReasoning(options.model, options.thinkingLevel),
			sessionId: `${options.sessionId}:compact`,
		},
	);

	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(response.errorMessage || "Compaction failed.");
	}

	const summary = extractAssistantText(response);
	if (!summary) {
		throw new Error("Compaction produced an empty summary.");
	}

	const firstKeptMessageIndex = boundaryStart + selection.hiddenMessages.length;
	const tokensBefore = estimateContextTokens(
		buildRuntimeContextMessages({
			messages: options.transcriptMessages,
			compaction: currentCompaction,
		}),
	).tokens;

	return {
		summary,
		compaction: {
			summary,
			firstKeptMessageIndex,
			transcriptBoundaryIndex: options.transcriptMessages.length,
			timestamp: Date.now(),
			tokensBefore,
		} satisfies SessionCompactionState,
		hiddenMessageCount: selection.hiddenMessages.length,
	};
}
