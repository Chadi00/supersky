import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentMessage } from "../../vendor/pi-agent-core/index.js";
import type { Api, Model } from "./piSource";
import { getSessionsDbPath } from "./paths";

type SessionRow = {
	id: string;
	title: string;
	created_at: number;
	updated_at: number;
	model_provider: string | null;
	model_id: string | null;
	workspace_root: string;
};

export type SessionSummary = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	modelProvider: string | null;
	modelId: string | null;
	workspaceRoot: string;
};

export type StoredSession = SessionSummary & {
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
		createdAt?: number;
	}): SessionSummary;
	updateSessionTitle(sessionId: string, title: string): void;
	updateSessionModel(sessionId: string, model: Model<Api> | null): void;
	replaceSessionMessages(sessionId: string, messages: AgentMessage[]): void;
	deleteSession(sessionId: string): void;
	getLastActiveSessionId(): string | null;
	setLastActiveSessionId(sessionId: string | null): void;
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
	};
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
				workspace_root TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS message (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				seq INTEGER NOT NULL,
				payload TEXT NOT NULL,
				UNIQUE(session_id, seq),
				FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS message_session_seq_idx ON message(session_id, seq);
			CREATE INDEX IF NOT EXISTS session_updated_at_idx ON session(updated_at);
		`);
	}

	listSessions(limit = 200): SessionSummary[] {
		const rows = this.db
			.query(
				`SELECT id, title, created_at, updated_at, model_provider, model_id, workspace_root
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
				`SELECT id, title, created_at, updated_at, model_provider, model_id, workspace_root
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
		return {
			...mapSessionRow(row),
			messages: messagesRows.map((entry) => JSON.parse(entry.payload) as AgentMessage),
		};
	}

	createSession(input: {
		id: string;
		title: string;
		workspaceRoot: string;
		model: Model<Api> | null;
		createdAt?: number;
	}): SessionSummary {
		const createdAt = input.createdAt ?? Date.now();
		this.db
			.query(
				`INSERT INTO session (
					id, title, created_at, updated_at, model_provider, model_id, workspace_root
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				input.id,
				input.title,
				createdAt,
				createdAt,
				input.model?.provider ?? null,
				input.model?.id ?? null,
				input.workspaceRoot,
			);
		return {
			id: input.id,
			title: input.title,
			createdAt,
			updatedAt: createdAt,
			modelProvider: input.model?.provider ?? null,
			modelId: input.model?.id ?? null,
			workspaceRoot: input.workspaceRoot,
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

	replaceSessionMessages(sessionId: string, messages: AgentMessage[]) {
		const now = Date.now();
		const transaction = this.db.transaction((session: string, payloads: AgentMessage[]) => {
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
		});
		transaction(sessionId, messages);
	}

	deleteSession(sessionId: string) {
		this.db.query("DELETE FROM session WHERE id = ?").run(sessionId);
		if (this.getLastActiveSessionId() === sessionId) {
			this.setLastActiveSessionId(null);
		}
	}

	getLastActiveSessionId() {
		const row = this.db
			.query("SELECT value FROM workspace_meta WHERE key = 'last_active_session_id'")
			.get() as { value: string } | null;
		return row?.value || null;
	}

	setLastActiveSessionId(sessionId: string | null) {
		if (!sessionId) {
			this.db
				.query("DELETE FROM workspace_meta WHERE key = 'last_active_session_id'")
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
