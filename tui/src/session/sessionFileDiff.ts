import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

import { createPatch } from "diff";
import type { EditToolDetails } from "../agent/tools/edit";
import type { WriteToolDetails } from "../agent/tools/write";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import { isToolResultMessage } from "./types";

/** Per-file session mutation totals (OpenCode-style aggregation across tool steps). */
export type SessionModifiedFile = {
	readonly path: string;
	readonly additions: number;
	readonly deletions: number;
	readonly deleted: boolean;
};

/**
 * Count `+` / `-` lines in a unified diff (same idea as OpenCode snapshot `diffFull` stats).
 */
export function countUnifiedPatchStats(patch: string) {
	let additions = 0;
	let deletions = 0;
	for (const line of patch.split(/\r?\n/)) {
		if (
			line.startsWith("---") ||
			line.startsWith("+++") ||
			line.startsWith("@@") ||
			line.startsWith("\\")
		) {
			continue;
		}
		if (line.startsWith("+")) {
			additions += 1;
		} else if (line.startsWith("-")) {
			deletions += 1;
		}
	}
	return { additions, deletions };
}

export function relativeWorkspacePath(
	absolutePath: string,
	workspaceRoot: string,
) {
	let rel = relative(workspaceRoot, absolutePath);
	if (!rel || rel.startsWith(`..${sep}`) || rel === "..") {
		return absolutePath;
	}
	if (sep === "\\") {
		rel = rel.replaceAll("\\", "/");
	}
	return rel;
}

function mergeFileStats(
	map: Map<string, { additions: number; deletions: number }>,
	path: string,
	additions: number,
	deletions: number,
) {
	const hit = map.get(path) ?? { additions: 0, deletions: 0 };
	map.set(path, {
		additions: hit.additions + additions,
		deletions: hit.deletions + deletions,
	});
}

type SessionTrackedFile = {
	absolutePath: string;
	path: string;
	originalExists: boolean;
	originalContent: string;
	latestContent: string;
};

type SessionTrackedFiles = {
	trackedFiles: SessionTrackedFile[];
	legacyRows: SessionModifiedFile[];
};

function hasSnapshotDetails(
	details:
		| {
				beforeContent?: unknown;
				afterContent?: unknown;
		  }
		| null
		| undefined,
): boolean {
	return (
		typeof details?.beforeContent === "string" &&
		typeof details?.afterContent === "string"
	);
}

function buildFileStats(path: string, before: string, after: string) {
	return {
		path,
		...countUnifiedPatchStats(
			createPatch(path, before, after, "before", "after"),
		),
	};
}

function listGitDeletedPaths(workspaceRoot: string) {
	const deletedPaths = new Set<string>();
	for (const cmd of [
		["git", "diff", "--name-only", "--diff-filter=D", "-z", "--"],
		["git", "diff", "--cached", "--name-only", "--diff-filter=D", "-z", "--"],
	] as const) {
		const result = Bun.spawnSync({
			cmd: [...cmd],
			cwd: workspaceRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		if (result.exitCode !== 0) {
			continue;
		}

		for (const path of Buffer.from(result.stdout)
			.toString("utf8")
			.split("\0")
			.filter(Boolean)) {
			deletedPaths.add(path);
		}
	}

	return [...deletedPaths].toSorted((a, b) => a.localeCompare(b));
}

function collectSessionTrackedFiles(
	messages: readonly AgentMessage[],
	workspaceRoot: string,
): SessionTrackedFiles {
	const trackedByPath = new Map<string, SessionTrackedFile>();
	const legacyStats = new Map<
		string,
		{ additions: number; deletions: number }
	>();

	for (const message of messages) {
		if (!isToolResultMessage(message) || message.isError) {
			continue;
		}

		if (message.toolName !== "edit" && message.toolName !== "write") {
			continue;
		}

		if (message.toolName === "edit") {
			const details = message.details as Partial<EditToolDetails> | undefined;
			if (!details?.absolutePath || !details.diff) {
				continue;
			}

			const path = relativeWorkspacePath(details.absolutePath, workspaceRoot);
			if (hasSnapshotDetails(details)) {
				const existing = trackedByPath.get(path);
				if (!existing) {
					trackedByPath.set(path, {
						absolutePath: details.absolutePath,
						path,
						originalExists: true,
						originalContent: details.beforeContent as string,
						latestContent: details.afterContent as string,
					});
				} else {
					trackedByPath.set(path, {
						...existing,
						latestContent: details.afterContent as string,
					});
				}
				continue;
			}

			const { additions, deletions } = countUnifiedPatchStats(details.diff);
			mergeFileStats(legacyStats, path, additions, deletions);
			continue;
		}

		const details = message.details as Partial<WriteToolDetails> | undefined;
		if (!details?.absolutePath || !details.diff) {
			continue;
		}

		const path = relativeWorkspacePath(details.absolutePath, workspaceRoot);
		if (hasSnapshotDetails(details)) {
			const existing = trackedByPath.get(path);
			if (!existing) {
				trackedByPath.set(path, {
					absolutePath: details.absolutePath,
					path,
					originalExists:
						typeof details.beforeExisted === "boolean"
							? details.beforeExisted
							: true,
					originalContent: details.beforeContent as string,
					latestContent: details.afterContent as string,
				});
			} else {
				trackedByPath.set(path, {
					...existing,
					latestContent: details.afterContent as string,
				});
			}
			continue;
		}

		const { additions, deletions } = countUnifiedPatchStats(details.diff);
		mergeFileStats(legacyStats, path, additions, deletions);
	}

	return {
		trackedFiles: [...trackedByPath.values()].toSorted((a, b) =>
			a.path.localeCompare(b.path),
		),
		legacyRows: [...legacyStats.entries()]
			.filter(([path]) => !trackedByPath.has(path))
			.map(([path, stats]) => ({
				path,
				additions: stats.additions,
				deletions: stats.deletions,
				deleted: false,
			}))
			.toSorted((a, b) => a.path.localeCompare(b.path)),
	};
}

/**
 * Resolve the final net file delta for this session.
 */
export async function buildSessionModifiedFiles(
	messages: readonly AgentMessage[],
	workspaceRoot: string,
): Promise<SessionModifiedFile[]> {
	const { trackedFiles, legacyRows } = collectSessionTrackedFiles(
		messages,
		workspaceRoot,
	);
	const snapshotRows = await Promise.all(
		trackedFiles.map(async (file) => {
			let currentExists = true;
			let currentContent = "";
			try {
				currentContent = await readFile(file.absolutePath, "utf8");
			} catch {
				currentExists = false;
			}

			if (
				currentExists === file.originalExists &&
				currentContent === file.originalContent
			) {
				if (
					!currentExists &&
					!file.originalExists &&
					file.latestContent.length > 0
				) {
					return {
						path: file.path,
						...countUnifiedPatchStats(
							createPatch(file.path, file.latestContent, "", "before", "after"),
						),
						deleted: true,
					};
				}

				return null;
			}

			return {
				...buildFileStats(
					file.path,
					file.originalContent,
					currentExists ? currentContent : "",
				),
				deleted: !currentExists,
			};
		}),
	);
	const rowsByPath = new Map<string, SessionModifiedFile>();
	for (const row of [
		...snapshotRows.filter((row) => row !== null),
		...legacyRows,
	]) {
		rowsByPath.set(row.path, row);
	}

	for (const path of listGitDeletedPaths(workspaceRoot)) {
		const existing = rowsByPath.get(path);
		rowsByPath.set(path, {
			path,
			additions: existing?.additions ?? 0,
			deletions: existing?.deletions ?? 0,
			deleted: true,
		});
	}

	return [...rowsByPath.values()].toSorted((a, b) =>
		a.path.localeCompare(b.path),
	);
}
