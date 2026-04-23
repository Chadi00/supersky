import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createWorkspaceSnapshotStore } from "./workspaceSnapshotStore";

test("tracks and restores the workspace file set", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "supersky-snapshot-workspace-"));
	const snapshotRoot = await mkdtemp(join(tmpdir(), "supersky-snapshot-store-"));

	await writeFile(join(workspaceRoot, "a.txt"), "one\n", "utf8");
	await writeFile(join(workspaceRoot, "b.txt"), "two\n", "utf8");

	const store = createWorkspaceSnapshotStore({
		workspaceRoot,
		snapshotsDir: snapshotRoot,
	});
	const snapshotId = store.track();

	await writeFile(join(workspaceRoot, "a.txt"), "changed\n", "utf8");
	await rm(join(workspaceRoot, "b.txt"), { force: true });
	await writeFile(join(workspaceRoot, "c.txt"), "three\n", "utf8");

	store.restore(snapshotId);

	await expect(readFile(join(workspaceRoot, "a.txt"), "utf8")).resolves.toBe("one\n");
	await expect(readFile(join(workspaceRoot, "b.txt"), "utf8")).resolves.toBe("two\n");
	await expect(readFile(join(workspaceRoot, "c.txt"), "utf8")).rejects.toThrow();

	await rm(workspaceRoot, { recursive: true, force: true });
	await rm(snapshotRoot, { recursive: true, force: true });
});

test("reverts changed files using the earliest matching snapshot", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "supersky-revert-workspace-"));
	const snapshotRoot = await mkdtemp(join(tmpdir(), "supersky-revert-store-"));
	const filePath = join(workspaceRoot, "a.txt");

	await writeFile(filePath, "a0", "utf8");

	const store = createWorkspaceSnapshotStore({
		workspaceRoot,
		snapshotsDir: snapshotRoot,
	});

	const snap1 = store.track();
	await writeFile(filePath, "a1", "utf8");
	const patch1 = store.patch(snap1);

	const snap2 = store.track();
	await writeFile(filePath, "a2", "utf8");
	const patch2 = store.patch(snap2);

	store.revert([patch1, patch2]);
	await expect(readFile(filePath, "utf8")).resolves.toBe("a0");

	store.revert([patch2]);
	await expect(readFile(filePath, "utf8")).resolves.toBe("a1");

	await rm(workspaceRoot, { recursive: true, force: true });
	await rm(snapshotRoot, { recursive: true, force: true });
});

test("diff reports reverted file changes against a saved snapshot", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "supersky-diff-workspace-"));
	const snapshotRoot = await mkdtemp(join(tmpdir(), "supersky-diff-store-"));

	await writeFile(join(workspaceRoot, "a.txt"), "base\n", "utf8");

	const store = createWorkspaceSnapshotStore({
		workspaceRoot,
		snapshotsDir: snapshotRoot,
	});
	const snapshotId = store.track();

	await writeFile(join(workspaceRoot, "a.txt"), "changed\n", "utf8");
	await writeFile(join(workspaceRoot, "b.txt"), "new\n", "utf8");

	const diff = store.diff(snapshotId);

	expect(diff).toContain("a.txt");
	expect(diff).toContain("b.txt");
	expect(diff).toContain("-base");
	expect(diff).toContain("+changed");

	await rm(workspaceRoot, { recursive: true, force: true });
	await rm(snapshotRoot, { recursive: true, force: true });
});
