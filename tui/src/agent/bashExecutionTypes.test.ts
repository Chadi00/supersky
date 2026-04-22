import { expect, test } from "bun:test";

import type { UserMessage } from "../vendor/pi-ai/index.js";
import {
	type BashExecutionMessage,
	convertSuperskyAgentMessagesToLlm,
} from "./bashExecutionTypes";

function user(text: string, timestamp: number): UserMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp,
	};
}

function bash(
	partial: Omit<BashExecutionMessage, "role">,
): BashExecutionMessage {
	return { role: "bashExecution", ...partial };
}

test("convertSuperskyAgentMessagesToLlm includes ! shell as user text", () => {
	const messages = [
		user("hi", 1),
		bash({
			command: "echo ok",
			output: "ok",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			timestamp: 2,
		}),
	];
	const llm = convertSuperskyAgentMessagesToLlm(messages);
	expect(llm).toHaveLength(2);
	expect(llm[1]?.role).toBe("user");
	expect(
		Array.isArray(llm[1]?.content) &&
			llm[1]?.content[0]?.type === "text" &&
			llm[1]?.content[0]?.text.includes("echo ok"),
	).toBe(true);
});

test("convertSuperskyAgentMessagesToLlm skips !! shell for the model", () => {
	const messages = [
		bash({
			command: "secret",
			output: "x",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			timestamp: 1,
			excludeFromContext: true,
		}),
		user("next", 2),
	];
	const llm = convertSuperskyAgentMessagesToLlm(messages);
	expect(llm).toHaveLength(1);
	expect(llm[0]).toEqual(user("next", 2));
});
