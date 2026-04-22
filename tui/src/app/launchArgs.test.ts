import { expect, test } from "bun:test";
import { resolveInitialSessionId } from "./launchArgs";

test("returns the first positional session id argument", () => {
	expect(resolveInitialSessionId(["bun", "bin/supersky", "session-123"])).toBe(
		"session-123",
	);
});

test("ignores missing or flag-like session arguments", () => {
	expect(resolveInitialSessionId(["bun", "bin/supersky"])).toBeNull();
	expect(resolveInitialSessionId(["bun", "bin/supersky", "--help"])).toBeNull();
	expect(resolveInitialSessionId(["bun", "bin/supersky", "   "])).toBeNull();
});
