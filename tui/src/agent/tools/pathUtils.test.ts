import { expect, test } from "bun:test";

import { shortenPath } from "./pathUtils";

test("shortenPath tolerates missing streamed tool arguments", () => {
	expect(shortenPath(undefined)).toBe("...");
	expect(shortenPath(null)).toBe("...");
	expect(shortenPath({ path: "README.md" })).toBe("...");
});
