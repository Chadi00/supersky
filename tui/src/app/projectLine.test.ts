import { expect, test } from "bun:test";

import {
	formatProjectLine,
	formatProjectPath,
	resolveProjectLine,
} from "./projectLine";

test("formats the home directory as a tilde", () => {
	expect(formatProjectPath("/Users/chadiek", "/Users/chadiek")).toBe("~");
});

test("replaces the home directory prefix when formatting a project line", () => {
	expect(
		formatProjectLine(
			"/Users/chadiek/projects/supersky",
			"main",
			"/Users/chadiek",
		),
	).toBe("~/projects/supersky:main");
});

test("omits the branch when one is not available", () => {
	expect(
		formatProjectLine("/tmp/scratch-project", undefined, "/Users/chadiek"),
	).toBe("/tmp/scratch-project");
});

test("resolves the project line from the launch directory", () => {
	expect(
		resolveProjectLine({
			directory: "/Users/chadiek/projects/supersky/tui",
			homeDirectory: "/Users/chadiek",
			getGitBranch: () => "feature/footer",
		}),
	).toBe("~/projects/supersky/tui:feature/footer");
});
