import type { ScrollBoxRenderable } from "@opentui/core";
import { useCallback } from "react";

import type { BashExecutionMessage } from "../agent/bashExecutionTypes";
import type { SuperskyToolDefinition } from "../agent/tools/types";
import { colors } from "../shared/theme";
import { formatMessageTimestamp } from "../shared/time";
import type { ToolResultMessage, UserMessage } from "../vendor/pi-ai/index.js";
import {
	AssistantMessage,
	AssistantStreamingIndicator,
} from "./AssistantMessage";
import {
	getUserMessageText,
	isToolResultMessage,
	type SessionState,
	type ToolExecutionState,
} from "./types";

type MessageListProps = {
	messages: SessionState["messages"];
	pendingBashMessages: BashExecutionMessage[];
	pendingUserMessages: SessionState["pendingUserMessages"];
	streamingMessage: SessionState["streamingMessage"];
	isStreaming: SessionState["isStreaming"];
	toolExecutions: ToolExecutionState[];
	toolDefinitions: Record<
		string,
		Pick<SuperskyToolDefinition, "icon" | "formatCall">
	>;
	onMouseDown?: () => void;
	onUserMessageMouseUp?: (message: UserMessage) => void;
};

export function getUserMessageRowId(message: UserMessage) {
	return `user-message-${message.timestamp}`;
}

export function MessageList({
	messages,
	pendingBashMessages,
	pendingUserMessages,
	streamingMessage,
	isStreaming,
	toolExecutions,
	toolDefinitions,
	onMouseDown,
	onUserMessageMouseUp,
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

	const renderBashExecution = (
		message: BashExecutionMessage,
		keyPrefix: string,
	) => {
		const headerColor = message.excludeFromContext
			? colors.mutedText
			: colors.accentText;
		const preview =
			message.output.length > 4000
				? `${message.output.slice(0, 4000)}\n…`
				: message.output;
		const statusParts: string[] = [];
		if (message.cancelled) {
			statusParts.push("(cancelled)");
		} else if (
			message.exitCode !== undefined &&
			message.exitCode !== null &&
			message.exitCode !== 0
		) {
			statusParts.push(`exit ${message.exitCode}`);
		}
		if (message.truncated && message.fullOutputPath) {
			statusParts.push(`truncated; full: ${message.fullOutputPath}`);
		}
		const statusLine = statusParts.length ? statusParts.join(" · ") : null;

		return (
			<box
				key={`${keyPrefix}-bash-${message.timestamp}-${message.command.slice(0, 24)}`}
				flexDirection="column"
				marginBottom={1}
			>
				<box
					border
					borderColor={
						message.excludeFromContext ? colors.mutedText : colors.toolBorder
					}
					paddingX={1}
					paddingY={1}
					flexDirection="column"
					gap={0}
				>
					<text fg={headerColor}>{`$ ${message.command}`}</text>
					{preview ? (
						<text fg={colors.dimText}>{preview}</text>
					) : (
						<text fg={colors.dimText}>(no output)</text>
					)}
					{statusLine ? (
						<text fg={colors.warningText}>{statusLine}</text>
					) : null}
					<text fg={colors.dimText}>
						{formatMessageTimestamp(new Date(message.timestamp))}
					</text>
				</box>
			</box>
		);
	};

	const renderUserMessage = (
		message: Extract<SessionState["messages"][number], { role: "user" }>,
		keyPrefix: string,
	) => (
		// biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive user-message primitive here.
		<box
			key={`${keyPrefix}-${message.timestamp}-${getUserMessageText(message).slice(0, 24)}`}
			id={keyPrefix === "user" ? getUserMessageRowId(message) : undefined}
			flexDirection="column"
			marginBottom={1}
			onMouseUp={
				keyPrefix === "user"
					? (event) => {
							if (event.button !== 0) {
								return;
							}
							onUserMessageMouseUp?.(message);
						}
					: undefined
			}
		>
			<box
				backgroundColor={colors.userMessageBackground}
				paddingX={1}
				paddingY={1}
				flexDirection="column"
				gap={0}
			>
				<text fg={colors.foregroundText}>{getUserMessageText(message)}</text>
				<text fg={colors.dimText}>
					{formatMessageTimestamp(new Date(message.timestamp))}
				</text>
			</box>
		</box>
	);

	const renderCompactionSummary = (
		message: Extract<
			SessionState["messages"][number],
			{ role: "compactionSummary" }
		>,
	) => (
		<box
			key={`compaction-${message.timestamp}`}
			flexDirection="column"
			marginBottom={1}
		>
			<box
				border
				borderColor={colors.commandMenuBorder}
				backgroundColor={colors.panelBackground}
				paddingX={1}
				paddingY={1}
				flexDirection="column"
			>
				<text fg={colors.accentText}>Session compacted</text>
				<text fg={colors.dimText}>{message.summary}</text>
				<text
					fg={colors.dimText}
				>{`${message.archivedMessageCount} archived message${message.archivedMessageCount === 1 ? "" : "s"}`}</text>
			</box>
		</box>
	);

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
						renderUserMessage(message, "user")
					) : message.role === "assistant" ? (
						<AssistantMessage
							key={getAssistantKey(message)}
							message={message}
							toolResultsByCallId={toolResultsByCallId}
							liveToolExecutionsByCallId={liveToolExecutionsByCallId}
							toolDefinitions={toolDefinitions}
						/>
					) : message.role === "bashExecution" ? (
						renderBashExecution(message, "committed")
					) : message.role === "compactionSummary" ? (
						renderCompactionSummary(message)
					) : null,
				)}
				{pendingBashMessages.map((message) =>
					renderBashExecution(message, "pending-bash"),
				)}
				{pendingUserMessages.map((message) =>
					renderUserMessage(message, "pending-user"),
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
				) : isStreaming ? (
					<box flexDirection="column" marginBottom={1}>
						<AssistantStreamingIndicator />
					</box>
				) : null}
			</box>
		</scrollbox>
	);
}
