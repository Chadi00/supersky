import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import type { Static } from "../../vendor/pi-ai/index.js";
import {
	type ImageContent,
	type TextContent,
	Type,
} from "../../vendor/pi-ai/index.js";
import { resolveReadPath, shortenPath } from "./pathUtils";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationResult,
	truncateHead,
} from "./truncate";
import type { SuperskyToolDefinition } from "./types";

const schema = Type.Object({
	path: Type.String({
		description: "Path to the file to read (relative or absolute)",
	}),
	offset: Type.Optional(
		Type.Number({
			description: "Line number to start reading from (1-indexed)",
		}),
	),
	limit: Type.Optional(
		Type.Number({ description: "Maximum number of lines to read" }),
	),
});

export type ReadToolInput = Static<typeof schema>;

export interface ReadToolDetails {
	absolutePath: string;
	truncation?: TruncationResult;
}

const imageMimeByExtension = new Map<string, string>([
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".gif", "image/gif"],
	[".webp", "image/webp"],
]);

function getImageMimeType(filePath: string) {
	const lower = filePath.toLowerCase();
	for (const [extension, mimeType] of imageMimeByExtension) {
		if (lower.endsWith(extension)) {
			return mimeType;
		}
	}
	return undefined;
}

function formatContinuationNotice(
	startLine: number,
	nextOffset: number,
	totalLines: number,
	truncatedBy: "lines" | "bytes",
) {
	const endLine = nextOffset - 1;
	if (truncatedBy === "lines") {
		return `[Showing lines ${startLine}-${endLine} of ${totalLines}. Use offset=${nextOffset} to continue.]`;
	}
	return `[Showing lines ${startLine}-${endLine} of ${totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
}

export function createReadTool(
	cwd: string,
): SuperskyToolDefinition<typeof schema, ReadToolDetails> {
	return {
		name: "read",
		label: "read",
		icon: "→",
		description:
			"Read the contents of a file. Supports text files and common image files. Text output is truncated to 2000 lines or 50KB, whichever is hit first.",
		promptSnippet: "Read file contents",
		promptGuidelines: ["Use read to examine files instead of cat or sed."],
		parameters: schema,
		formatCall(args) {
			const suffix =
				args.offset !== undefined || args.limit !== undefined
					? `:${args.offset ?? 1}${args.limit !== undefined ? `-${(args.offset ?? 1) + args.limit - 1}` : ""}`
					: "";
			return `Read ${shortenPath(args.path)}${suffix}`;
		},
		async execute(_toolCallId, args) {
			const absolutePath = resolveReadPath(args.path, cwd);
			await access(absolutePath, constants.R_OK);

			const imageMimeType = getImageMimeType(absolutePath);
			if (imageMimeType) {
				const buffer = await readFile(absolutePath);
				const content: Array<TextContent | ImageContent> = [
					{ type: "text", text: `Read image file [${imageMimeType}]` },
					{
						type: "image",
						data: buffer.toString("base64"),
						mimeType: imageMimeType,
					},
				];
				return {
					content,
					details: { absolutePath },
				};
			}

			const text = (await readFile(absolutePath)).toString("utf8");
			const allLines = text.split("\n");
			const startIndex = Math.max(0, (args.offset ?? 1) - 1);
			if (startIndex >= allLines.length) {
				throw new Error(
					`Offset ${args.offset} is beyond end of file (${allLines.length} lines total)`,
				);
			}

			const selected =
				args.limit !== undefined
					? allLines
							.slice(
								startIndex,
								Math.min(startIndex + args.limit, allLines.length),
							)
							.join("\n")
					: allLines.slice(startIndex).join("\n");

			const truncation = truncateHead(selected, {
				maxLines: args.limit ?? DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let output = truncation.content;
			let details: ReadToolDetails = { absolutePath };
			if (truncation.firstLineExceedsLimit) {
				output = `[Line ${startIndex + 1} exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use a smaller offset/limit range.]`;
				details = { absolutePath, truncation };
			} else if (truncation.truncated) {
				const nextOffset = startIndex + truncation.outputLines + 1;
				output = `${truncation.content}\n\n${formatContinuationNotice(startIndex + 1, nextOffset, allLines.length, truncation.truncatedBy ?? "bytes")}`;
				details = { absolutePath, truncation };
			} else if (
				args.limit !== undefined &&
				startIndex + args.limit < allLines.length
			) {
				const nextOffset = startIndex + args.limit + 1;
				output = `${output}\n\n[${allLines.length - (startIndex + args.limit)} more lines in file. Use offset=${nextOffset} to continue.]`;
			}

			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
	};
}
