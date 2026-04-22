import { accessSync, constants } from "node:fs";
import * as os from "node:os";
import { isAbsolute, resolve as resolvePath } from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";

function normalizeUnicodeSpaces(value: string) {
	return value.replace(UNICODE_SPACES, " ");
}

function normalizeAtPrefix(value: string) {
	return value.startsWith("@") ? value.slice(1) : value;
}

function fileExists(filePath: string) {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function tryMacOSScreenshotPath(filePath: string) {
	return filePath.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string) {
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string) {
	return filePath.replace(/'/g, "\u2019");
}

export function expandPath(filePath: string) {
	const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(filePath));
	if (normalized === "~") {
		return os.homedir();
	}
	if (normalized.startsWith("~/")) {
		return os.homedir() + normalized.slice(1);
	}
	return normalized;
}

export function resolveToCwd(filePath: string, cwd: string) {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) {
		return expanded;
	}
	return resolvePath(cwd, expanded);
}

export function resolveReadPath(filePath: string, cwd: string) {
	const resolved = resolveToCwd(filePath, cwd);
	if (fileExists(resolved)) {
		return resolved;
	}

	const variants = [
		tryMacOSScreenshotPath(resolved),
		tryNFDVariant(resolved),
		tryCurlyQuoteVariant(resolved),
		tryCurlyQuoteVariant(tryNFDVariant(resolved)),
	];
	for (const variant of variants) {
		if (variant !== resolved && fileExists(variant)) {
			return variant;
		}
	}

	return resolved;
}

export function shortenPath(filePath: unknown) {
	if (typeof filePath !== "string") {
		return "...";
	}

	const home = os.homedir();
	if (filePath.startsWith(home)) {
		return `~${filePath.slice(home.length)}`;
	}
	return filePath;
}
