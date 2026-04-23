import { bashExecutionToText } from "../agent/bashExecutionTypes";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { AssistantMessage, UserMessage } from "../vendor/pi-ai/index.js";
import { getUserMessageText, isToolResultMessage } from "./types";

function formatAssistantText(message: AssistantMessage) {
	const blocks = message.content
		.map((part) => {
			if (part.type === "text") {
				return part.text.trim();
			}
			if (part.type === "thinking") {
				return `_Thinking:_\n${part.thinking.trim()}`;
			}
			if (part.type === "toolCall") {
				return [
					`**Tool call: ${part.name}**`,
					"",
					"```json",
					JSON.stringify(part.arguments, null, 2),
					"```",
				].join("\n");
			}
			return "";
		})
		.filter(Boolean);

	return blocks.join("\n\n").trim();
}

function formatToolResult(
	message: Extract<AgentMessage, { role: "toolResult" }>,
) {
	const text = message.content
		.map((part) => {
			if (part.type === "text") {
				return part.text;
			}
			return `[image ${part.mimeType}]`;
		})
		.join("\n")
		.trim();

	return `**Tool result: ${message.toolName}**\n\n${text || "(no output)"}`;
}

export function transcriptHeaderMarkdown(input: {
	title: string;
	sessionId: string;
	workspaceRoot: string;
	createdAt: number;
	updatedAt: number;
	modelLabel?: string | null;
	thinkingLevel?: string;
}) {
	return [
		`# ${input.title}`,
		"",
		`**Session ID:** ${input.sessionId}`,
		`**Workspace:** ${input.workspaceRoot}`,
		`**Created:** ${new Date(input.createdAt).toLocaleString()}`,
		`**Updated:** ${new Date(input.updatedAt).toLocaleString()}`,
		input.modelLabel ? `**Model:** ${input.modelLabel}` : null,
		input.thinkingLevel ? `**Thinking level:** ${input.thinkingLevel}` : null,
		"",
		"---",
	]
		.filter(Boolean)
		.join("\n");
}

export function messageToTranscriptMarkdown(message: AgentMessage) {
	if (message.role === "user") {
		return `## User\n\n${getUserMessageText(message as UserMessage)}`;
	}

	if (message.role === "assistant") {
		return `## Assistant\n\n${formatAssistantText(message)}`;
	}

	if (isToolResultMessage(message)) {
		return formatToolResult(message);
	}

	if (message.role === "bashExecution") {
		return `## Shell\n\n${bashExecutionToText(message)}`;
	}

	if (message.role === "compactionSummary") {
		return `## Session Summary\n\n${message.summary}`;
	}

	return "";
}
