import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentMessage } from "../../vendor/pi-agent-core/index.js";
import type { ThinkingLevel } from "../../vendor/pi-agent-core/types.js";
import {
	getVisibleTranscriptMessages,
	isCompactionSummaryMessage,
	type SessionCompactionState,
} from "../compaction";
import { estimateContextTokens } from "../contextUsageDisplay";
import { getSessionsDbPath } from "./paths";
import type { Api, Model } from "./piSource";

type SessionRow = {
	id: string;
	title: string;
	created_at: number;
	updated_at: number;
	model_provider: string | null;
	model_id: string | null;
	workspace_root: string;
	parent_session_id: string | null;
	thinking_level: ThinkingLevel;
	archived_messages_json: string | null;
	compaction_state_json: string | null;
	revert_message_timestamp: number | null;
	revert_message_index: number | null;
	revert_snapshot_id: string | null;
	revert_diff: string | null;
};

type SessionPatchRow = {
	message_timestamp: number;
	snapshot_id: string;
	files_json: string;
};

export type SessionRevertState = {
	messageTimestamp: number;
	messageIndex?: number;
	snapshotId: string;
	diff: string;
};

export type SessionPatch = {
	messageTimestamp: number;
	snapshotId: string;
	files: string[];
};

export type SessionSummary = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	modelProvider: string | null;
	modelId: string | null;
	workspaceRoot: string;
	parentSessionId: string | null;
	thinkingLevel: ThinkingLevel;
	revert: SessionRevertState | null;
};

export type StoredSession = SessionSummary & {
	archivedMessages: AgentMessage[];
	compaction: SessionCompactionState | null;
	messages: AgentMessage[];
};

export interface SessionStoreLike {
	listSessions(limit?: number): SessionSummary[];
	getSession(sessionId: string): StoredSession | null;
	createSession(input: {
		id: string;
		title: string;
		workspaceRoot: string;
		model: Model<Api> | null;
		thinkingLevel?: ThinkingLevel;
		parentSessionId?: string | null;
		createdAt?: number;
	}): SessionSummary;
	updateSessionTitle(sessionId: string, title: string): void;
	updateSessionModel(sessionId: string, model: Model<Api> | null): void;
	updateSessionThinkingLevel(
		sessionId: string,
		thinkingLevel: ThinkingLevel,
	): void;
	setSessionRevert(sessionId: string, revert: SessionRevertState | null): void;
	replaceSessionArchivedMessages(
		sessionId: string,
		messages: AgentMessage[],
	): void;
	replaceSessionCompaction(
		sessionId: string,
		compaction: SessionCompactionState | null,
	): void;
	replaceSessionMessages(sessionId: string, messages: AgentMessage[]): void;
	listSessionPatches(sessionId: string): SessionPatch[];
	replaceSessionPatches(sessionId: string, patches: SessionPatch[]): void;
	addSessionPatch(sessionId: string, patch: SessionPatch): void;
	deleteSessionPatchesFrom(sessionId: string, messageTimestamp: number): void;
	listReferencedSnapshotIds(): string[];
	deleteSession(sessionId: string): void;
	getLastActiveSessionId(): string | null;
	setLastActiveSessionId(sessionId: string | null): void;
}

function mapRevert(row: SessionRow): SessionRevertState | null {
	if (
		row.revert_message_timestamp === null ||
		row.revert_snapshot_id === null ||
		row.revert_diff === null
	) {
		return null;
	}

	return {
		messageTimestamp: row.revert_message_timestamp,
		...(row.revert_message_index === null
			? {}
			: { messageIndex: row.revert_message_index }),
		snapshotId: row.revert_snapshot_id,
		diff: row.revert_diff,
	};
}

function parseCompactionState(compactionJson: string | null) {
	if (!compactionJson) {
		return null as SessionCompactionState | null;
	}

	try {
		const parsed = JSON.parse(compactionJson) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"summary" in parsed &&
			"firstKeptMessageIndex" in parsed &&
			"timestamp" in parsed &&
			"tokensBefore" in parsed &&
			typeof parsed.summary === "string" &&
			typeof parsed.firstKeptMessageIndex === "number" &&
			typeof parsed.timestamp === "number" &&
			typeof parsed.tokensBefore === "number" &&
			(!("transcriptBoundaryIndex" in parsed) ||
				typeof parsed.transcriptBoundaryIndex === "number")
		) {
			return parsed as SessionCompactionState;
		}
	} catch {
		// Ignore malformed rows and treat them as uncompacted.
	}

	return null as SessionCompactionState | null;
}

function mapSessionRow(row: SessionRow): SessionSummary {
	return {
		id: row.id,
		title: row.title,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		modelProvider: row.model_provider,
		modelId: row.model_id,
		workspaceRoot: row.workspace_root,
		parentSessionId: row.parent_session_id,
		thinkingLevel: row.thinking_level,
		revert: mapRevert(row),
	};
}

function parsePatchFiles(filesJson: string) {
	try {
		const parsed = JSON.parse(filesJson) as unknown;
		if (
			Array.isArray(parsed) &&
			parsed.every((item) => typeof item === "string")
		) {
			return parsed;
		}
	} catch {
		// Ignore malformed rows and treat them as empty.
	}
	return [] as string[];
}

function parseArchivedMessages(messagesJson: string | null) {
	if (!messagesJson) {
		return [] as AgentMessage[];
	}

	try {
		const parsed = JSON.parse(messagesJson) as unknown;
		return Array.isArray(parsed) ? (parsed as AgentMessage[]) : [];
	} catch {
		return [] as AgentMessage[];
	}
}

export class SessionStore implements SessionStoreLike {
	private db: Database;

	constructor(
		private workspaceRoot: string,
		dbPath = getSessionsDbPath(workspaceRoot),
	) {
		mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
		this.db = new Database(dbPath, { create: true });
		this.db.exec("PRAGMA journal_mode=WAL;");
		this.db.exec("PRAGMA foreign_keys=ON;");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS workspace_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS session (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				model_provider TEXT,
				model_id TEXT,
				workspace_root TEXT NOT NULL,
				head_snapshot_id TEXT,
				parent_session_id TEXT,
				thinking_level TEXT NOT NULL DEFAULT 'medium',
				archived_messages_json TEXT,
				compaction_state_json TEXT,
				revert_message_timestamp INTEGER,
				revert_message_index INTEGER,
				revert_snapshot_id TEXT,
				revert_diff TEXT
			);
			CREATE TABLE IF NOT EXISTS message (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				seq INTEGER NOT NULL,
				payload TEXT NOT NULL,
				UNIQUE(session_id, seq),
				FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
			);
			CREATE TABLE IF NOT EXISTS session_patch (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				message_timestamp INTEGER NOT NULL,
				snapshot_id TEXT NOT NULL,
				files_json TEXT NOT NULL,
				FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS message_session_seq_idx ON message(session_id, seq);
			CREATE INDEX IF NOT EXISTS session_updated_at_idx ON session(updated_at);
			CREATE INDEX IF NOT EXISTS session_patch_session_timestamp_idx
				ON session_patch(session_id, message_timestamp, id);
		`);
		const columns = this.db.query("PRAGMA table_info(session)").all() as Array<{
			name: string;
		}>;
		const ensureColumn = (name: string, ddl: string) => {
			if (columns.some((column) => column.name === name)) {
				return;
			}
			this.db.query(ddl).run();
		};
		ensureColumn(
			"head_snapshot_id",
			"ALTER TABLE session ADD COLUMN head_snapshot_id TEXT",
		);
		ensureColumn(
			"parent_session_id",
			"ALTER TABLE session ADD COLUMN parent_session_id TEXT",
		);
		ensureColumn(
			"thinking_level",
			"ALTER TABLE session ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'medium'",
		);
		ensureColumn(
			"archived_messages_json",
			"ALTER TABLE session ADD COLUMN archived_messages_json TEXT",
		);
		ensureColumn(
			"compaction_state_json",
			"ALTER TABLE session ADD COLUMN compaction_state_json TEXT",
		);
		ensureColumn(
			"revert_message_timestamp",
			"ALTER TABLE session ADD COLUMN revert_message_timestamp INTEGER",
		);
		ensureColumn(
			"revert_message_index",
			"ALTER TABLE session ADD COLUMN revert_message_index INTEGER",
		);
		ensureColumn(
			"revert_snapshot_id",
			"ALTER TABLE session ADD COLUMN revert_snapshot_id TEXT",
		);
		ensureColumn(
			"revert_diff",
			"ALTER TABLE session ADD COLUMN revert_diff TEXT",
		);
	}

	private persistMigratedSessionState(input: {
		sessionId: string;
		updatedAt: number;
		archivedMessages: AgentMessage[];
		compaction: SessionCompactionState | null;
		revert: SessionRevertState | null;
		messages: AgentMessage[];
	}) {
		const transaction = this.db.transaction(
			(options: {
				sessionId: string;
				updatedAt: number;
				archivedMessages: AgentMessage[];
				compaction: SessionCompactionState | null;
				revert: SessionRevertState | null;
				messages: AgentMessage[];
			}) => {
				this.db
					.query(
						`UPDATE session
						 SET archived_messages_json = ?,
						     compaction_state_json = ?,
						     revert_message_timestamp = ?,
						     revert_message_index = ?,
						     revert_snapshot_id = ?,
						     revert_diff = ?,
						     updated_at = ?
						 WHERE id = ?`,
					)
					.run(
						JSON.stringify(options.archivedMessages),
						options.compaction ? JSON.stringify(options.compaction) : null,
						options.revert?.messageTimestamp ?? null,
						options.revert?.messageIndex ?? null,
						options.revert?.snapshotId ?? null,
						options.revert?.diff ?? null,
						options.updatedAt,
						options.sessionId,
					);

				this.db
					.query("DELETE FROM message WHERE session_id = ?")
					.run(options.sessionId);
				const insert = this.db.query(
					"INSERT INTO message (session_id, seq, payload) VALUES (?, ?, ?)",
				);
				for (let index = 0; index < options.messages.length; index += 1) {
					insert.run(
						options.sessionId,
						index,
						JSON.stringify(options.messages[index]),
					);
				}
			},
		);

		transaction(input);
	}

	listSessions(limit = 200): SessionSummary[] {
		const rows = this.db
			.query(
				`SELECT id, title, created_at, updated_at, model_provider, model_id,
				        workspace_root, parent_session_id, thinking_level,
				        archived_messages_json, compaction_state_json,
				        revert_message_timestamp, revert_message_index,
				        revert_snapshot_id, revert_diff
				 FROM session
				 ORDER BY updated_at DESC
				 LIMIT ?`,
			)
			.all(limit) as SessionRow[];
		return rows.map(mapSessionRow);
	}

	getSession(sessionId: string): StoredSession | null {
		const row = this.db
			.query(
				`SELECT id, title, created_at, updated_at, model_provider, model_id,
				        workspace_root, parent_session_id, thinking_level,
				        archived_messages_json, compaction_state_json,
				        revert_message_timestamp, revert_message_index,
				        revert_snapshot_id, revert_diff
				 FROM session
				 WHERE id = ?`,
			)
			.get(sessionId) as SessionRow | null;
		if (!row) {
			return null;
		}
		const messagesRows = this.db
			.query("SELECT payload FROM message WHERE session_id = ? ORDER BY seq")
			.all(sessionId) as Array<{ payload: string }>;
		let archivedMessages = parseArchivedMessages(row.archived_messages_json);
		let messages = messagesRows.map(
			(entry) => JSON.parse(entry.payload) as AgentMessage,
		);
		let compaction = parseCompactionState(row.compaction_state_json);
		let revert = mapRevert(row);
		let migrated = false;

		if (
			archivedMessages.length > 0 ||
			messages.some(isCompactionSummaryMessage)
		) {
			const summaryMessage = messages.find(isCompactionSummaryMessage) ?? null;
			messages = [
				...archivedMessages,
				...getVisibleTranscriptMessages(messages),
			];
			compaction = summaryMessage
				? {
						summary: summaryMessage.summary,
						firstKeptMessageIndex: archivedMessages.length,
						timestamp: summaryMessage.timestamp,
						tokensBefore:
							typeof summaryMessage.tokensBefore === "number"
								? summaryMessage.tokensBefore
								: estimateContextTokens(messages).tokens,
					}
				: compaction;
			archivedMessages = [];
			migrated = true;
		}

		if (
			compaction &&
			(compaction.firstKeptMessageIndex <= 0 ||
				compaction.firstKeptMessageIndex >= messages.length)
		) {
			compaction = null;
			migrated = true;
		}

		if (
			compaction &&
			(!Number.isFinite(compaction.tokensBefore) ||
				compaction.tokensBefore <= 0)
		) {
			compaction = {
				...compaction,
				tokensBefore: estimateContextTokens(messages).tokens,
			};
			migrated = true;
		}

		if (
			compaction &&
			compaction.transcriptBoundaryIndex !== undefined &&
			(!Number.isFinite(compaction.transcriptBoundaryIndex) ||
				compaction.transcriptBoundaryIndex <= 0 ||
				compaction.transcriptBoundaryIndex > messages.length)
		) {
			const { transcriptBoundaryIndex: _transcriptBoundaryIndex, ...next } =
				compaction;
			compaction = next;
			migrated = true;
		}

		if (revert && revert.messageIndex === undefined && messages.length > 0) {
			const revertTimestamp = revert.messageTimestamp;
			const messageIndex = messages.findIndex(
				(message) => message.timestamp >= revertTimestamp,
			);
			revert = messageIndex >= 0 ? { ...revert, messageIndex } : null;
			migrated = true;
		}

		if (migrated) {
			this.persistMigratedSessionState({
				sessionId,
				updatedAt: row.updated_at,
				archivedMessages,
				compaction,
				revert,
				messages,
			});
		}

		return {
			id: row.id,
			title: row.title,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			modelProvider: row.model_provider,
			modelId: row.model_id,
			workspaceRoot: row.workspace_root,
			parentSessionId: row.parent_session_id,
			thinkingLevel: row.thinking_level,
			revert,
			archivedMessages,
			compaction,
			messages,
		};
	}

	createSession(input: {
		id: string;
		title: string;
		workspaceRoot: string;
		model: Model<Api> | null;
		thinkingLevel?: ThinkingLevel;
		parentSessionId?: string | null;
		createdAt?: number;
	}): SessionSummary {
		const createdAt = input.createdAt ?? Date.now();
		this.db
			.query(
				`INSERT INTO session (
					id, title, created_at, updated_at, model_provider, model_id,
					workspace_root, parent_session_id, thinking_level,
					archived_messages_json, compaction_state_json,
					revert_message_timestamp, revert_message_index,
					revert_snapshot_id, revert_diff
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
			)
			.run(
				input.id,
				input.title,
				createdAt,
				createdAt,
				input.model?.provider ?? null,
				input.model?.id ?? null,
				input.workspaceRoot,
				input.parentSessionId ?? null,
				input.thinkingLevel ?? "medium",
			);
		return {
			id: input.id,
			title: input.title,
			createdAt,
			updatedAt: createdAt,
			modelProvider: input.model?.provider ?? null,
			modelId: input.model?.id ?? null,
			workspaceRoot: input.workspaceRoot,
			parentSessionId: input.parentSessionId ?? null,
			thinkingLevel: input.thinkingLevel ?? "medium",
			revert: null,
		};
	}

	updateSessionTitle(sessionId: string, title: string) {
		this.db
			.query("UPDATE session SET title = ?, updated_at = ? WHERE id = ?")
			.run(title, Date.now(), sessionId);
	}

	updateSessionModel(sessionId: string, model: Model<Api> | null) {
		this.db
			.query(
				"UPDATE session SET model_provider = ?, model_id = ?, updated_at = ? WHERE id = ?",
			)
			.run(model?.provider ?? null, model?.id ?? null, Date.now(), sessionId);
	}

	updateSessionThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel) {
		this.db
			.query(
				"UPDATE session SET thinking_level = ?, updated_at = ? WHERE id = ?",
			)
			.run(thinkingLevel, Date.now(), sessionId);
	}

	setSessionRevert(sessionId: string, revert: SessionRevertState | null) {
		this.db
			.query(
				`UPDATE session
				 SET revert_message_timestamp = ?, revert_message_index = ?, revert_snapshot_id = ?, revert_diff = ?, updated_at = ?
				 WHERE id = ?`,
			)
			.run(
				revert?.messageTimestamp ?? null,
				revert?.messageIndex ?? null,
				revert?.snapshotId ?? null,
				revert?.diff ?? null,
				Date.now(),
				sessionId,
			);
	}

	replaceSessionArchivedMessages(sessionId: string, messages: AgentMessage[]) {
		this.db
			.query(
				"UPDATE session SET archived_messages_json = ?, updated_at = ? WHERE id = ?",
			)
			.run(JSON.stringify(messages), Date.now(), sessionId);
	}

	replaceSessionCompaction(
		sessionId: string,
		compaction: SessionCompactionState | null,
	) {
		this.db
			.query(
				"UPDATE session SET compaction_state_json = ?, updated_at = ? WHERE id = ?",
			)
			.run(
				compaction ? JSON.stringify(compaction) : null,
				Date.now(),
				sessionId,
			);
	}

	replaceSessionMessages(sessionId: string, messages: AgentMessage[]) {
		const now = Date.now();
		const transaction = this.db.transaction(
			(session: string, payloads: AgentMessage[]) => {
				this.db.query("DELETE FROM message WHERE session_id = ?").run(session);
				const insert = this.db.query(
					"INSERT INTO message (session_id, seq, payload) VALUES (?, ?, ?)",
				);
				for (let index = 0; index < payloads.length; index += 1) {
					insert.run(session, index, JSON.stringify(payloads[index]));
				}
				this.db
					.query("UPDATE session SET updated_at = ? WHERE id = ?")
					.run(now, session);
			},
		);
		transaction(sessionId, messages);
	}

	listSessionPatches(sessionId: string) {
		const rows = this.db
			.query(
				`SELECT message_timestamp, snapshot_id, files_json
				 FROM session_patch
				 WHERE session_id = ?
				 ORDER BY message_timestamp ASC, id ASC`,
			)
			.all(sessionId) as SessionPatchRow[];
		return rows.map((row) => ({
			messageTimestamp: row.message_timestamp,
			snapshotId: row.snapshot_id,
			files: parsePatchFiles(row.files_json),
		}));
	}

	replaceSessionPatches(sessionId: string, patches: SessionPatch[]) {
		const now = Date.now();
		const transaction = this.db.transaction(
			(session: string, nextPatches: SessionPatch[]) => {
				this.db
					.query("DELETE FROM session_patch WHERE session_id = ?")
					.run(session);
				const insert = this.db.query(
					`INSERT INTO session_patch (session_id, message_timestamp, snapshot_id, files_json)
					 VALUES (?, ?, ?, ?)`,
				);
				for (const patch of nextPatches) {
					insert.run(
						session,
						patch.messageTimestamp,
						patch.snapshotId,
						JSON.stringify(patch.files),
					);
				}
				this.db
					.query("UPDATE session SET updated_at = ? WHERE id = ?")
					.run(now, session);
			},
		);
		transaction(sessionId, patches);
	}

	addSessionPatch(sessionId: string, patch: SessionPatch) {
		this.db
			.query(
				`INSERT INTO session_patch (session_id, message_timestamp, snapshot_id, files_json)
				 VALUES (?, ?, ?, ?)`,
			)
			.run(
				sessionId,
				patch.messageTimestamp,
				patch.snapshotId,
				JSON.stringify(patch.files),
			);
		this.db
			.query("UPDATE session SET updated_at = ? WHERE id = ?")
			.run(Date.now(), sessionId);
	}

	deleteSessionPatchesFrom(sessionId: string, messageTimestamp: number) {
		this.db
			.query(
				`DELETE FROM session_patch
				 WHERE session_id = ? AND message_timestamp >= ?`,
			)
			.run(sessionId, messageTimestamp);
		this.db
			.query("UPDATE session SET updated_at = ? WHERE id = ?")
			.run(Date.now(), sessionId);
	}

	listReferencedSnapshotIds() {
		const rows = this.db
			.query(
				`SELECT revert_snapshot_id AS snapshot_id
				 FROM session
				 WHERE revert_snapshot_id IS NOT NULL
				 UNION
				 SELECT snapshot_id FROM session_patch`,
			)
			.all() as Array<{ snapshot_id: string }>;
		return rows.map((row) => row.snapshot_id);
	}

	deleteSession(sessionId: string) {
		this.db.query("DELETE FROM session WHERE id = ?").run(sessionId);
		if (this.getLastActiveSessionId() === sessionId) {
			this.setLastActiveSessionId(null);
		}
	}

	getLastActiveSessionId() {
		const row = this.db
			.query(
				"SELECT value FROM workspace_meta WHERE key = 'last_active_session_id'",
			)
			.get() as { value: string } | null;
		return row?.value || null;
	}

	setLastActiveSessionId(sessionId: string | null) {
		if (!sessionId) {
			this.db
				.query(
					"DELETE FROM workspace_meta WHERE key = 'last_active_session_id'",
				)
				.run();
			return;
		}
		this.db
			.query(
				`INSERT INTO workspace_meta (key, value)
				 VALUES ('last_active_session_id', ?)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			)
			.run(sessionId);
	}
}
