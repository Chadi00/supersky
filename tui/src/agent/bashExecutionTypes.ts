import type { AgentMessage } from "../vendor/pi-agent-core/types.js";
import type { Message, UserMessage } from "../vendor/pi-ai/index.js";

export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
	timestamp: number;
	excludeFromContext?: boolean;
}

declare module "../vendor/pi-agent-core/types.js" {
	interface CustomAgentMessages {
		bashExecution: BashExecutionMessage;
	}
}

export function bashExecutionToText(msg: BashExecutionMessage): string {
	let text = `Ran \`${msg.command}\`\n`;
	if (msg.output) {
		text += `\`\`\`\n${msg.output}\n\`\`\``;
	} else {
		text += "(no output)";
	}
	if (msg.cancelled) {
		text += "\n\n(command cancelled)";
	} else if (
		msg.exitCode !== null &&
		msg.exitCode !== undefined &&
		msg.exitCode !== 0
	) {
		text += `\n\nCommand exited with code ${msg.exitCode}`;
	}
	if (msg.truncated && msg.fullOutputPath) {
		text += `\n\n[Output truncated. Full output: ${msg.fullOutputPath}]`;
	}
	return text;
}

/**
 * Maps transcript messages to LLM input. Bash lines from `!` become user text;
 * `!!` lines are omitted from the model context (still kept in the transcript).
 */
export function convertSuperskyAgentMessagesToLlm(
	messages: AgentMessage[],
): Message[] {
	const result: Message[] = [];
	for (const message of messages) {
		if (
			message.role === "user" ||
			message.role === "assistant" ||
			message.role === "toolResult"
		) {
			result.push(message);
			continue;
		}
		if (message.role === "bashExecution") {
			if (message.excludeFromContext) {
				continue;
			}
			const user: UserMessage = {
				role: "user",
				content: [{ type: "text", text: bashExecutionToText(message) }],
				timestamp: message.timestamp,
			};
			result.push(user);
		}
	}
	return result;
}
