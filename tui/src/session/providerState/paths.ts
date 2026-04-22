import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function getAgentDir() {
	return join(homedir(), ".supersky", "agent");
}

export function getAuthPath() {
	return join(getAgentDir(), "auth.json");
}

export function getSettingsPath() {
	return join(getAgentDir(), "settings.json");
}

function normalizePath(path: string) {
	return path.replace(/\/+$/, "") || "/";
}

export function resolveWorkspaceRoot(directory = process.cwd()) {
	const result = Bun.spawnSync({
		cmd: ["git", "rev-parse", "--show-toplevel"],
		cwd: directory,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode === 0) {
		const root = Buffer.from(result.stdout).toString("utf8").trim();
		if (root) {
			return normalizePath(root);
		}
	}
	return normalizePath(directory);
}

export function getWorkspaceId(workspaceRoot: string) {
	return createHash("sha256")
		.update(normalizePath(workspaceRoot))
		.digest("hex")
		.slice(0, 16);
}

export function getWorkspaceDir(workspaceRoot: string) {
	return join(getAgentDir(), "workspaces", getWorkspaceId(workspaceRoot));
}

export function getSessionsDbPath(workspaceRoot: string) {
	return join(getWorkspaceDir(workspaceRoot), "sessions.db");
}

function ensureParentDir(filePath: string) {
	const parentDir = dirname(filePath);
	if (!existsSync(parentDir)) {
		mkdirSync(parentDir, { recursive: true, mode: 0o700 });
	}
}

export function readJsonFile<T>(filePath: string, fallback: T) {
	if (!existsSync(filePath)) {
		return fallback;
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		return JSON.parse(content) as T;
	} catch {
		return fallback;
	}
}

export function writeJsonFile(filePath: string, value: unknown) {
	ensureParentDir(filePath);
	writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
	chmodSync(filePath, 0o600);
}
