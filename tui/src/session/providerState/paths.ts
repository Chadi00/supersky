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
