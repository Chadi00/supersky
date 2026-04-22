import { homedir } from "node:os";
import { sep } from "node:path";

type ResolveProjectLineOptions = {
	directory?: string;
	homeDirectory?: string;
	getGitBranch?: (directory: string) => string | undefined;
};

function trimTrailingSeparator(path: string) {
	if (path.length > 1 && path.endsWith(sep)) {
		return path.slice(0, -1);
	}

	return path;
}

export function formatProjectPath(
	directory: string,
	homeDirectory = homedir(),
) {
	if (!homeDirectory) {
		return directory;
	}

	const normalizedDirectory = trimTrailingSeparator(directory);
	const normalizedHomeDirectory = trimTrailingSeparator(homeDirectory);

	if (normalizedDirectory === normalizedHomeDirectory) {
		return "~";
	}

	if (normalizedDirectory.startsWith(`${normalizedHomeDirectory}${sep}`)) {
		return `~${normalizedDirectory.slice(normalizedHomeDirectory.length)}`;
	}

	return normalizedDirectory;
}

export function getCurrentGitBranch(directory: string) {
	const result = Bun.spawnSync({
		cmd: ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
		cwd: directory,
		stdout: "pipe",
		stderr: "pipe",
	});

	if (result.exitCode !== 0) {
		return undefined;
	}

	const branch = Buffer.from(result.stdout).toString("utf8").trim();

	return branch || undefined;
}

export function formatProjectLine(
	directory: string,
	branch?: string,
	homeDirectory = homedir(),
) {
	const projectPath = formatProjectPath(directory, homeDirectory);

	if (!branch) {
		return projectPath;
	}

	return `${projectPath}:${branch}`;
}

export function resolveProjectLine(options: ResolveProjectLineOptions = {}) {
	const directory = options.directory ?? process.cwd();
	const homeDirectory = options.homeDirectory ?? homedir();
	const branch = (options.getGitBranch ?? getCurrentGitBranch)(directory);

	return formatProjectLine(directory, branch, homeDirectory);
}
