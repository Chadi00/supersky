import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { createPatch } from "diff";
import type { Static } from "../../vendor/pi-ai/index.js";
import { Type } from "../../vendor/pi-ai/index.js";
import { withFileMutationQueue } from "./fileMutationQueue";
import { resolveToCwd, shortenPath } from "./pathUtils";
import type { SuperskyToolDefinition } from "./types";

const replaceEditSchema = Type.Object(
	{
		oldText: Type.String({
			description:
				"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
		}),
		newText: Type.String({
			description: "Replacement text for this targeted edit.",
		}),
	},
	{ additionalProperties: false },
);

const schema = Type.Object(
	{
		path: Type.String({
			description: "Path to the file to edit (relative or absolute)",
		}),
		edits: Type.Array(replaceEditSchema, {
			description:
				"One or more targeted replacements. Each edit is matched against the original file, not incrementally.",
		}),
	},
	{ additionalProperties: false },
);

export type EditToolInput = Static<typeof schema>;

export interface EditToolDetails {
	absolutePath: string;
	beforeContent: string;
	afterContent: string;
	diff: string;
	editCount: number;
}

type Replacement = {
	start: number;
	end: number;
	oldText: string;
	newText: string;
};

function normalizeToLF(value: string) {
	return value.replace(/\r\n/g, "\n");
}

function restoreLineEndings(value: string, lineEnding: "\n" | "\r\n") {
	return lineEnding === "\r\n" ? value.replace(/\n/g, "\r\n") : value;
}

function detectLineEnding(value: string): "\n" | "\r\n" {
	return value.includes("\r\n") ? "\r\n" : "\n";
}

function findUniqueReplacement(content: string, oldText: string) {
	const start = content.indexOf(oldText);
	if (start < 0) {
		throw new Error("Edit failed: oldText was not found in the file.");
	}
	if (content.indexOf(oldText, start + oldText.length) >= 0) {
		throw new Error("Edit failed: oldText must be unique in the file.");
	}
	return start;
}

function applyReplacements(content: string, edits: EditToolInput["edits"]) {
	if (edits.length === 0) {
		throw new Error(
			"Edit tool input is invalid. edits must contain at least one replacement.",
		);
	}

	const replacements: Replacement[] = edits.map((edit) => {
		const start = findUniqueReplacement(content, edit.oldText);
		return {
			start,
			end: start + edit.oldText.length,
			oldText: edit.oldText,
			newText: edit.newText,
		};
	});

	replacements.sort((left, right) => left.start - right.start);
	for (let index = 1; index < replacements.length; index += 1) {
		const previous = replacements[index - 1];
		const current = replacements[index];
		if (previous && current && current.start < previous.end) {
			throw new Error("Edit failed: edits must not overlap.");
		}
	}

	let result = "";
	let cursor = 0;
	for (const replacement of replacements) {
		result += content.slice(cursor, replacement.start);
		result += replacement.newText;
		cursor = replacement.end;
	}
	result += content.slice(cursor);
	return result;
}

export function createEditTool(
	cwd: string,
): SuperskyToolDefinition<typeof schema, EditToolDetails> {
	return {
		name: "edit",
		label: "edit",
		icon: "~",
		description:
			"Apply one or more exact text replacements to a file. Each edit must match the original file exactly and uniquely.",
		promptSnippet: "Apply targeted file edits",
		promptGuidelines: ["Use edit for localized changes to existing files."],
		parameters: schema,
		formatCall(args) {
			return `Edit ${shortenPath(args.path)}`;
		},
		async execute(_toolCallId, args) {
			const absolutePath = resolveToCwd(args.path, cwd);
			await access(absolutePath, constants.R_OK | constants.W_OK);
			return withFileMutationQueue(absolutePath, async () => {
				const original = (await readFile(absolutePath)).toString("utf8");
				const lineEnding = detectLineEnding(original);
				const normalizedOriginal = normalizeToLF(original);
				const normalizedEdits = args.edits.map((edit) => ({
					oldText: normalizeToLF(edit.oldText),
					newText: normalizeToLF(edit.newText),
				}));
				const updatedNormalized = applyReplacements(
					normalizedOriginal,
					normalizedEdits,
				);
				const updated = restoreLineEndings(updatedNormalized, lineEnding);
				await writeFile(absolutePath, updated, "utf8");

				const diff = createPatch(
					args.path,
					original,
					updated,
					"before",
					"after",
				);
				return {
					content: [
						{
							type: "text",
							text: `Successfully applied ${args.edits.length} edit${args.edits.length === 1 ? "" : "s"} to ${args.path}`,
						},
					],
					details: {
						absolutePath,
						beforeContent: original,
						afterContent: updated,
						diff,
						editCount: args.edits.length,
					},
				};
			});
		},
	};
}
