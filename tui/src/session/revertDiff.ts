import { parsePatch } from "diff";

export function getRevertDiffFiles(diffText: string) {
	if (!diffText) {
		return [] as Array<{
			filename: string;
			additions: number;
			deletions: number;
		}>;
	}

	try {
		return parsePatch(diffText).map((patch) => ({
			filename:
				[patch.newFileName, patch.oldFileName].find(
					(item) => item && item !== "/dev/null",
				)?.replace(/^[ab]\//, "") ?? "unknown",
			additions: patch.hunks.reduce(
				(sum, hunk) =>
					sum + hunk.lines.filter((line) => line.startsWith("+")).length,
				0,
			),
			deletions: patch.hunks.reduce(
				(sum, hunk) =>
					sum + hunk.lines.filter((line) => line.startsWith("-")).length,
				0,
			),
		}));
	} catch {
		return [];
	}
}
