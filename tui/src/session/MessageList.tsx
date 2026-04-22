import type { ScrollBoxRenderable } from "@opentui/core";
import { useCallback } from "react";

import type { SuperskyToolDefinition } from "../agent/tools/types";
import { colors } from "../shared/theme";
import { formatMessageTimestamp } from "../shared/time";
import type { ToolResultMessage } from "../vendor/pi-ai/index.js";
import { AssistantMessage } from "./AssistantMessage";
import {
	getUserMessageText,
	isToolResultMessage,
	type SessionState,
	type ToolExecutionState,
} from "./types";

type MessageListProps = {
	messages: SessionState["messages"];
	streamingMessage: SessionState["streamingMessage"];
	toolExecutions: ToolExecutionState[];
	toolDefinitions: Record<
		string,
		Pick<SuperskyToolDefinition, "icon" | "formatCall">
	>;
	onMouseDown?: () => void;
};

export function MessageList({
	messages,
	streamingMessage,
	toolExecutions,
	toolDefinitions,
	onMouseDown,
}: MessageListProps) {
	const setMessagesScrollRef = useCallback(
		(node: ScrollBoxRenderable | null) => {
			if (!node) {
				return;
			}

			node.verticalScrollBar.visible = false;
			node.horizontalScrollBar.visible = false;
		},
		[],
	);

	const toolResultsByCallId = new Map<string, ToolResultMessage>();
	for (const message of messages) {
		if (isToolResultMessage(message)) {
			toolResultsByCallId.set(message.toolCallId, message);
		}
	}
	const liveToolExecutionsByCallId = new Map(
		toolExecutions.map(
			(execution) => [execution.toolCallId, execution] as const,
		),
	);
	const seenAssistantKeys = new Map<string, number>();

	const getAssistantKey = (
		message: Extract<SessionState["messages"][number], { role: "assistant" }>,
	) => {
		const contentSignature = message.content
			.map((part) => {
				if (part.type === "text") return `text:${part.text}`;
				if (part.type === "thinking") return `thinking:${part.thinking}`;
				return `tool:${part.id}:${part.name}`;
			})
			.join("|");
		const baseKey = `assistant-${message.timestamp}-${message.provider}-${message.model}-${contentSignature}`;
		const count = seenAssistantKeys.get(baseKey) ?? 0;
		seenAssistantKeys.set(baseKey, count + 1);
		return count === 0 ? baseKey : `${baseKey}-${count + 1}`;
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Message list clicks refocus the composer textarea.
		<scrollbox
			ref={setMessagesScrollRef}
			flexGrow={1}
			focused={false}
			focusable={false}
			stickyScroll
			stickyStart="bottom"
			style={{
				rootOptions: { flexGrow: 1, minHeight: 0 },
				wrapperOptions: { backgroundColor: colors.background },
				viewportOptions: { backgroundColor: colors.background },
				contentOptions: { backgroundColor: colors.background },
				scrollbarOptions: { visible: false },
				verticalScrollbarOptions: { visible: false },
				horizontalScrollbarOptions: { visible: false },
			}}
			onMouseDown={() => {
				onMouseDown?.();
			}}
		>
			<box flexDirection="column" padding={1} gap={0}>
				{messages.map((message) =>
					message.role === "user" ? (
						<box
							key={`user-${message.timestamp}-${getUserMessageText(message).slice(0, 24)}`}
							flexDirection="column"
							marginBottom={1}
						>
							<box
								backgroundColor={colors.userMessageBackground}
								paddingX={1}
								paddingY={1}
								flexDirection="column"
								gap={0}
							>
								<text fg={colors.foregroundText}>
									{getUserMessageText(message)}
								</text>
								<text fg={colors.dimText}>
									{formatMessageTimestamp(new Date(message.timestamp))}
								</text>
							</box>
						</box>
					) : message.role === "assistant" ? (
						<AssistantMessage
							key={getAssistantKey(message)}
							message={message}
							toolResultsByCallId={toolResultsByCallId}
							liveToolExecutionsByCallId={liveToolExecutionsByCallId}
							toolDefinitions={toolDefinitions}
						/>
					) : null,
				)}
				{streamingMessage ? (
					<AssistantMessage
						key={`streaming-${streamingMessage.timestamp}`}
						message={streamingMessage}
						toolResultsByCallId={toolResultsByCallId}
						liveToolExecutionsByCallId={liveToolExecutionsByCallId}
						toolDefinitions={toolDefinitions}
						isStreaming
					/>
				) : null}
			</box>
		</scrollbox>
	);
}
