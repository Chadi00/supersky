import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createWorkspaceSnapshotStore } from "./workspaceSnapshotStore";

test("captures and restores the workspace file set", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "supersky-snapshot-workspace-"));
	const snapshotRoot = await mkdtemp(join(tmpdir(), "supersky-snapshot-store-"));

	await writeFile(join(workspaceRoot, "a.txt"), "one\n", "utf8");
	await writeFile(join(workspaceRoot, "b.txt"), "two\n", "utf8");

	const store = createWorkspaceSnapshotStore({
		workspaceRoot,
		snapshotsDir: snapshotRoot,
	});
	const snapshotId = await store.capture();

	await writeFile(join(workspaceRoot, "a.txt"), "changed\n", "utf8");
	await rm(join(workspaceRoot, "b.txt"), { force: true });
	await writeFile(join(workspaceRoot, "c.txt"), "three\n", "utf8");

	await store.restore(snapshotId);

	await expect(readFile(join(workspaceRoot, "a.txt"), "utf8")).resolves.toBe("one\n");
	await expect(readFile(join(workspaceRoot, "b.txt"), "utf8")).resolves.toBe("two\n");
	await expect(readFile(join(workspaceRoot, "c.txt"), "utf8")).rejects.toThrow();

	await rm(workspaceRoot, { recursive: true, force: true });
	await rm(snapshotRoot, { recursive: true, force: true });
});
