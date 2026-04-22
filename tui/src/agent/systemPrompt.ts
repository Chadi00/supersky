import type { SuperskyToolDefinition } from "./tools/types";

export function buildSystemPrompt(options: {
	cwd: string;
	date: string;
	tools: Array<
		Pick<SuperskyToolDefinition, "name" | "promptSnippet" | "promptGuidelines">
	>;
}) {
	const visibleTools = options.tools
		.map((tool) => `- ${tool.name}: ${tool.promptSnippet}`)
		.join("\n");
	const guidelines = Array.from(
		new Set([
			"Be concise in your responses.",
			"Show file paths clearly when working with files.",
			...options.tools.flatMap((tool) => tool.promptGuidelines ?? []),
		]),
	)
		.map((line) => `- ${line}`)
		.join("\n");

	return [
		"You are an expert coding assistant operating inside supersky, a local coding agent harness.",
		"You help the user by reading files, editing code, writing files, and running shell commands.",
		"",
		"Available tools:",
		visibleTools,
		"",
		"Guidelines:",
		guidelines,
		"",
		`Current date: ${options.date}`,
		`Current working directory: ${options.cwd}`,
	].join("\n");
}
