import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createPatch } from "diff";
import type { Static } from "../../vendor/pi-ai/index.js";
import { Type } from "../../vendor/pi-ai/index.js";
import { withFileMutationQueue } from "./fileMutationQueue";
import { resolveToCwd, shortenPath } from "./pathUtils";
import type { SuperskyToolDefinition } from "./types";

const schema = Type.Object({
	path: Type.String({
		description: "Path to the file to write (relative or absolute)",
	}),
	content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = Static<typeof schema>;

export interface WriteToolDetails {
	absolutePath: string;
	bytes: number;
	beforeExisted: boolean;
	beforeContent: string;
	afterContent: string;
	/** Unified diff vs previous file contents (empty before if the file was new). */
	diff: string;
}

export function createWriteTool(
	cwd: string,
): SuperskyToolDefinition<typeof schema, WriteToolDetails> {
	return {
		name: "write",
		label: "write",
		icon: "+",
		description:
			"Write content to a file. Creates parent directories if needed and overwrites the target file.",
		promptSnippet: "Create or overwrite files",
		promptGuidelines: ["Use write only for new files or complete rewrites."],
		parameters: schema,
		formatCall(args) {
			return `Write ${shortenPath(args.path)}`;
		},
		async execute(_toolCallId, args) {
			const absolutePath = resolveToCwd(args.path, cwd);
			let before = "";
			let beforeExisted = true;
			try {
				before = (await readFile(absolutePath)).toString("utf8");
			} catch {
				before = "";
				beforeExisted = false;
			}
			await withFileMutationQueue(absolutePath, async () => {
				await mkdir(dirname(absolutePath), { recursive: true });
				await writeFile(absolutePath, args.content, "utf8");
			});
			const after = args.content;
			const diff = createPatch(args.path, before, after, "before", "after");
			return {
				content: [
					{
						type: "text",
						text: `Successfully wrote ${args.content.length} bytes to ${args.path}`,
					},
				],
				details: {
					absolutePath,
					bytes: args.content.length,
					beforeExisted,
					beforeContent: before,
					afterContent: after,
					diff,
				},
			};
		},
	};
}
