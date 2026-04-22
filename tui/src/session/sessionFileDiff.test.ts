import { expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPatch } from "diff";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import {
	buildSessionModifiedFiles,
	countUnifiedPatchStats,
	relativeWorkspacePath,
} from "./sessionFileDiff";

test("countUnifiedPatchStats matches a simple createPatch diff", () => {
	const patch = createPatch(
		"foo.ts",
		"line1\n",
		"line1\nline2\n",
		"before",
		"after",
	);
	expect(countUnifiedPatchStats(patch)).toEqual({ additions: 1, deletions: 0 });
});

test("buildSessionModifiedFiles returns the current net diff for a modified file", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-session-file-diff-"),
	);
	const filePath = join(workspaceRoot, "a.ts");
	await writeFile(filePath, "base\n", "utf8");
	const messages = [
		{
			role: "toolResult" as const,
			toolCallId: "1",
			toolName: "edit",
			content: [],
			isError: false,
			timestamp: 1,
			details: {
				absolutePath: filePath,
				beforeContent: "base\n",
				afterContent: "base\none\n",
				diff: createPatch("a.ts", "base\n", "base\none\n", "x", "y"),
				editCount: 1,
			},
		},
		{
			role: "toolResult" as const,
			toolCallId: "2",
			toolName: "edit",
			content: [],
			isError: false,
			timestamp: 2,
			details: {
				absolutePath: filePath,
				beforeContent: "base\none\n",
				afterContent: "base\none\ntwo\n",
				diff: createPatch("a.ts", "base\none\n", "base\none\ntwo\n", "x", "y"),
				editCount: 1,
			},
		},
	] satisfies AgentMessage[];

	await writeFile(filePath, "base\none\ntwo\n", "utf8");
	await expect(
		buildSessionModifiedFiles(messages, workspaceRoot),
	).resolves.toEqual([
		{ path: "a.ts", additions: 2, deletions: 0, deleted: false },
	]);
	await rm(workspaceRoot, { recursive: true, force: true });
});

test("buildSessionModifiedFiles keeps a new file that was later removed", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-session-file-diff-"),
	);
	const filePath = join(workspaceRoot, "hello.md");
	const messages = [
		{
			role: "toolResult" as const,
			toolCallId: "1",
			toolName: "write",
			content: [],
			isError: false,
			timestamp: 1,
			details: {
				absolutePath: filePath,
				bytes: 6,
				beforeExisted: false,
				beforeContent: "",
				afterContent: "hello\n",
				diff: createPatch("hello.md", "", "hello\n", "x", "y"),
			},
		},
	] satisfies AgentMessage[];

	await writeFile(filePath, "hello\n", "utf8");
	await unlink(filePath);
	await expect(
		buildSessionModifiedFiles(messages, workspaceRoot),
	).resolves.toEqual([
		{ path: "hello.md", additions: 0, deletions: 1, deleted: true },
	]);
	await rm(workspaceRoot, { recursive: true, force: true });
});

test("buildSessionModifiedFiles marks an existing file deleted", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-session-file-diff-"),
	);
	const filePath = join(workspaceRoot, "gone.ts");
	await writeFile(filePath, "base\none\n", "utf8");
	const messages = [
		{
			role: "toolResult" as const,
			toolCallId: "1",
			toolName: "edit",
			content: [],
			isError: false,
			timestamp: 1,
			details: {
				absolutePath: filePath,
				beforeContent: "base\none\n",
				afterContent: "base\none\ntwo\n",
				diff: createPatch(
					"gone.ts",
					"base\none\n",
					"base\none\ntwo\n",
					"x",
					"y",
				),
				editCount: 1,
			},
		},
	] satisfies AgentMessage[];

	await unlink(filePath);
	await expect(
		buildSessionModifiedFiles(messages, workspaceRoot),
	).resolves.toEqual([
		{ path: "gone.ts", additions: 0, deletions: 2, deleted: true },
	]);
	await rm(workspaceRoot, { recursive: true, force: true });
});

test("buildSessionModifiedFiles includes git-tracked deleted files without tool results", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-session-file-diff-"),
	);
	const filePath = join(workspaceRoot, "tracked.ts");

	const initResult = Bun.spawnSync({
		cmd: ["git", "init"],
		cwd: workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(initResult.exitCode).toBe(0);

	await writeFile(filePath, "tracked\n", "utf8");

	const addResult = Bun.spawnSync({
		cmd: ["git", "add", "tracked.ts"],
		cwd: workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(addResult.exitCode).toBe(0);

	const commitResult = Bun.spawnSync({
		cmd: [
			"git",
			"-c",
			"user.name=Supersky Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"-m",
			"initial",
		],
		cwd: workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(commitResult.exitCode).toBe(0);

	await unlink(filePath);

	await expect(buildSessionModifiedFiles([], workspaceRoot)).resolves.toEqual([
		{ path: "tracked.ts", additions: 0, deletions: 0, deleted: true },
	]);
	await rm(workspaceRoot, { recursive: true, force: true });
});

test("buildSessionModifiedFiles hides a file restored to its original content", async () => {
	const workspaceRoot = await mkdtemp(
		join(tmpdir(), "supersky-session-file-diff-"),
	);
	const filePath = join(workspaceRoot, "a.ts");
	await writeFile(filePath, "base\n", "utf8");
	const messages = [
		{
			role: "toolResult" as const,
			toolCallId: "1",
			toolName: "edit",
			content: [],
			isError: false,
			timestamp: 1,
			details: {
				absolutePath: filePath,
				beforeContent: "base\n",
				afterContent: "base\none\n",
				diff: createPatch("a.ts", "base\n", "base\none\n", "x", "y"),
				editCount: 1,
			},
		},
		{
			role: "toolResult" as const,
			toolCallId: "2",
			toolName: "edit",
			content: [],
			isError: false,
			timestamp: 2,
			details: {
				absolutePath: filePath,
				beforeContent: "base\none\n",
				afterContent: "base\n",
				diff: createPatch("a.ts", "base\none\n", "base\n", "x", "y"),
				editCount: 1,
			},
		},
	] satisfies AgentMessage[];

	await writeFile(filePath, "base\n", "utf8");
	await expect(
		buildSessionModifiedFiles(messages, workspaceRoot),
	).resolves.toEqual([]);
	await rm(workspaceRoot, { recursive: true, force: true });
});

test("relativeWorkspacePath maps absolute paths under the workspace root", () => {
	expect(relativeWorkspacePath("/proj/tui/src/x.ts", "/proj")).toBe(
		"tui/src/x.ts",
	);
});
