/**
 * Context token display and cost lines — aligned with pi-mono
 * (packages/coding-agent/src/modes/interactive/components/footer.ts and
 * packages/coding-agent/src/core/compaction/compaction.ts).
 */
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { AssistantMessage, Usage } from "../vendor/pi-ai/index.js";
import type { Api, Model } from "./providerState/piSource";

/** Format token counts (same as pi-mono interactive footer). */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/** Total context tokens from usage (pi-mono calculateContextTokens). */
export function calculateContextTokens(usage: Usage): number {
	return (
		usage.totalTokens ||
		usage.input + usage.output + usage.cacheRead + usage.cacheWrite
	);
}

function getAssistantUsage(msg: AgentMessage): Usage | undefined {
	if (msg.role === "assistant" && "usage" in msg) {
		const assistantMsg = msg as AssistantMessage;
		if (
			assistantMsg.stopReason !== "aborted" &&
			assistantMsg.stopReason !== "error" &&
			assistantMsg.usage
		) {
			return assistantMsg.usage;
		}
	}
	return undefined;
}

type ContextUsageEstimate = {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
};

/**
 * Per-message token estimate (chars/4), matching pi-mono `estimateTokens`
 * for supported roles.
 */
function estimateTokens(message: AgentMessage): number {
	let chars = 0;
	// String role: pi-mono supports extra AgentMessage kinds not in the base Message union.
	const role = (message as { role: string }).role;
	const m = message as unknown as Record<string, unknown>;
	if (role === "user") {
		const content = m.content;
		if (typeof content === "string") {
			chars = content.length;
		} else if (Array.isArray(content)) {
			for (const block of content) {
				if (
					typeof block === "object" &&
					block &&
					"type" in block &&
					block.type === "text" &&
					"text" in block &&
					typeof (block as { text?: string }).text === "string"
				) {
					chars += (block as { text: string }).text.length;
				}
			}
		}
		return Math.ceil(chars / 4);
	}
	if (role === "assistant") {
		for (const block of (message as AssistantMessage).content) {
			if (block.type === "text") {
				chars += block.text.length;
			} else if (block.type === "thinking") {
				chars += block.thinking.length;
			} else if (block.type === "toolCall") {
				chars += block.name.length + JSON.stringify(block.arguments).length;
			}
		}
		return Math.ceil(chars / 4);
	}
	if (role === "custom") {
		chars = String(m.content).length;
		return Math.ceil(chars / 4);
	}
	if (role === "toolResult") {
		const content = m.content;
		if (typeof content === "string") {
			chars = content.length;
		} else if (Array.isArray(content)) {
			for (const block of content) {
				if (typeof block === "object" && block && "type" in block) {
					if (block.type === "text" && "text" in block) {
						chars += String((block as { text: string }).text).length;
					}
					if (block.type === "image") {
						chars += 4800;
					}
				}
			}
		}
		return Math.ceil(chars / 4);
	}
	if (role === "bashExecution") {
		if (m.excludeFromContext) {
			return 0;
		}
		chars = String(m.command).length + String(m.output).length;
		return Math.ceil(chars / 4);
	}
	if (role === "branchSummary" || role === "compactionSummary") {
		chars = String(m.summary).length;
		return Math.ceil(chars / 4);
	}
	return 0;
}

function getLastAssistantUsageInfo(
	messages: AgentMessage[],
): { usage: Usage; index: number } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const entry = messages[i];
		if (!entry) continue;
		const usage = getAssistantUsage(entry);
		if (usage) return { usage, index: i };
	}
	return undefined;
}

/**
 * Context size estimate from the transcript, matching pi-mono `estimateContextTokens`.
 */
export function estimateContextTokens(
	messages: AgentMessage[],
): ContextUsageEstimate {
	const usageInfo = getLastAssistantUsageInfo(messages);

	if (!usageInfo) {
		let estimated = 0;
		for (const message of messages) {
			estimated += estimateTokens(message);
		}
		return {
			tokens: estimated,
			usageTokens: 0,
			trailingTokens: estimated,
			lastUsageIndex: null,
		};
	}

	const usageTokens = calculateContextTokens(usageInfo.usage);
	let trailingTokens = 0;
	for (let i = usageInfo.index + 1; i < messages.length; i++) {
		const entry = messages[i];
		if (entry) {
			trailingTokens += estimateTokens(entry);
		}
	}

	return {
		tokens: usageTokens + trailingTokens,
		usageTokens,
		trailingTokens,
		lastUsageIndex: usageInfo.index,
	};
}

function sumCostFromTranscript(
	messages: AgentMessage[],
	streaming: AssistantMessage | null,
) {
	let total = 0;
	for (const m of messages) {
		if (m.role === "assistant") {
			const a = m as AssistantMessage;
			if (a.usage) {
				total += a.usage.cost.total;
			}
		}
	}
	if (streaming?.usage) {
		total += streaming.usage.cost.total;
	}
	return total;
}

export interface ContextUsage {
	tokens: number;
	contextWindow: number;
	percent: number;
}

/**
 * Current context window usage for the active model (no compaction, unlike full pi-mono
 * `AgentSession#getContextUsage` — supersky has no session compaction).
 */
export function getContextUsage(
	model: Model<Api> | null | undefined,
	messages: AgentMessage[],
	streaming: AssistantMessage | null,
): ContextUsage | undefined {
	if (!model) return undefined;

	const contextWindow = model.contextWindow ?? 0;
	if (contextWindow <= 0) return undefined;

	const combined: AgentMessage[] = streaming
		? [...messages, streaming as AgentMessage]
		: messages;

	const estimate = estimateContextTokens(combined);
	const percent = (estimate.tokens / contextWindow) * 100;

	return {
		tokens: estimate.tokens,
		contextWindow,
		percent,
	};
}

/**
 * Three sidebar lines: tokens, % of context used, and session cost (pi-mono footer rules).
 */
export function buildSessionSidebarUsageLines(
	model: Model<Api> | null | undefined,
	messages: AgentMessage[],
	streaming: AssistantMessage | null,
	isUsingSubscription: boolean,
): string[] {
	const contextUsage = getContextUsage(model, messages, streaming);
	const cost = sumCostFromTranscript(messages, streaming);

	if (!contextUsage) {
		return [
			"—",
			"—",
			isUsingSubscription || cost
				? `$${cost.toFixed(3)}${isUsingSubscription ? " (sub)" : ""} spent`
				: "$0.000 spent",
		];
	}

	const { tokens, percent } = contextUsage;
	const tokensLabel = `${formatTokens(tokens)} tokens`;
	const percentLabel = `${percent.toFixed(1)}% used`;
	const usingSub = isUsingSubscription;
	const costLine =
		cost || usingSub
			? `$${cost.toFixed(3)}${usingSub ? " (sub)" : ""} spent`
			: "$0.000 spent";

	return [tokensLabel, percentLabel, costLine];
}
