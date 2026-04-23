import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "../../vendor/pi-agent-core/index.js";
import { SessionStore } from "./sessionStore";

const workspaceRoot = "/tmp/supersky-test-workspace";

function withStore(run: (store: SessionStore) => void) {
	const tempDir = mkdtempSync(join(tmpdir(), "supersky-session-store-"));
	const dbPath = join(tempDir, "sessions.db");
	try {
		run(new SessionStore(workspaceRoot, dbPath));
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

test("creates, lists, renames, and deletes sessions", () => {
	withStore((store) => {
		store.createSession({
			id: "s-1",
			title: "First",
			workspaceRoot,
			model: null,
		});
		store.createSession({
			id: "s-2",
			title: "Second",
			workspaceRoot,
			model: null,
			createdAt: Date.now() + 1,
		});

		expect(store.listSessions().map((session) => session.id)).toEqual([
			"s-2",
			"s-1",
		]);
		store.updateSessionTitle("s-1", "Renamed");
		expect(store.getSession("s-1")?.title).toBe("Renamed");

		store.deleteSession("s-2");
		expect(store.getSession("s-2")).toBeNull();
		expect(store.listSessions().map((session) => session.id)).toEqual(["s-1"]);
	});
});

test("persists and reloads full message transcripts", () => {
	withStore((store) => {
		store.createSession({
			id: "s-1",
			title: "Transcript",
			workspaceRoot,
			model: null,
		});

		const messages: AgentMessage[] = [
			{
				role: "user",
				content: [{ type: "text", text: "hello" }],
				timestamp: 1,
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "world" }],
				api: "openai-responses",
				provider: "test-provider",
				model: "test-model",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						total: 0,
					},
				},
				stopReason: "stop",
				timestamp: 2,
			},
		];

		store.replaceSessionMessages("s-1", messages);
		expect(store.getSession("s-1")?.messages).toEqual(messages);
	});
});

test("persists revert state and session patches", () => {
	withStore((store) => {
		store.createSession({
			id: "s-1",
			title: "Transcript",
			workspaceRoot,
			model: null,
		});

		store.setSessionRevert("s-1", {
			messageTimestamp: 200,
			snapshotId: "snap-current",
			diff: "diff text",
		});
		store.addSessionPatch("s-1", {
			messageTimestamp: 100,
			snapshotId: "snap-before-1",
			files: ["a.txt"],
		});
		store.addSessionPatch("s-1", {
			messageTimestamp: 200,
			snapshotId: "snap-before-2",
			files: ["a.txt", "b.txt"],
		});

		expect(store.getSession("s-1")?.revert).toEqual({
			messageTimestamp: 200,
			snapshotId: "snap-current",
			diff: "diff text",
		});
		expect(store.listSessionPatches("s-1")).toEqual([
			{
				messageTimestamp: 100,
				snapshotId: "snap-before-1",
				files: ["a.txt"],
			},
			{
				messageTimestamp: 200,
				snapshotId: "snap-before-2",
				files: ["a.txt", "b.txt"],
			},
		]);
		expect(new Set(store.listReferencedSnapshotIds())).toEqual(
			new Set(["snap-current", "snap-before-1", "snap-before-2"]),
		);

		store.deleteSessionPatchesFrom("s-1", 200);
		expect(store.listSessionPatches("s-1")).toEqual([
			{
				messageTimestamp: 100,
				snapshotId: "snap-before-1",
				files: ["a.txt"],
			},
		]);

		store.setSessionRevert("s-1", null);
		expect(store.getSession("s-1")?.revert).toBeNull();
	});
});
