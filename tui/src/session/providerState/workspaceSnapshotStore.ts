import { randomUUID } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { getWorkspaceDir } from "./paths";

type SnapshotManifestFile = {
	path: string;
	mode: number;
};

type SnapshotManifest = {
	v: 1;
	files: SnapshotManifestFile[];
};

export interface WorkspaceSnapshotStoreLike {
	capture(): string;
	restore(snapshotId: string): void;
	has(snapshotId: string): boolean;
	pruneReferencedSnapshotIds(snapshotIds: Iterable<string>): void;
}

type WorkspaceSnapshotStoreOptions = {
	workspaceRoot: string;
	snapshotsDir?: string;
};

type WorkspaceFile = {
	absolutePath: string;
	relativePath: string;
	mode: number;
};

function getSnapshotsDir(workspaceRoot: string) {
	return join(getWorkspaceDir(workspaceRoot), "snapshots");
}

function parseGitListedFiles(output: Uint8Array) {
	return Buffer.from(output)
		.toString("utf8")
		.split("\0")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function listFallbackWorkspaceFiles(
	workspaceRoot: string,
	directory = workspaceRoot,
): WorkspaceFile[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files: WorkspaceFile[] = [];

	for (const entry of entries) {
		if (entry.name === ".git") {
			continue;
		}

		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFallbackWorkspaceFiles(workspaceRoot, absolutePath));
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const details = statSync(absolutePath);
		files.push({
			absolutePath,
			relativePath: relative(workspaceRoot, absolutePath).replaceAll("\\", "/"),
			mode: details.mode & 0o777,
		});
	}

	return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function listWorkspaceFiles(workspaceRoot: string): WorkspaceFile[] {
	const gitResult = Bun.spawnSync({
		cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		cwd: workspaceRoot,
		stdout: "pipe",
		stderr: "pipe",
	});

	if (gitResult.exitCode === 0) {
		return parseGitListedFiles(gitResult.stdout)
			.map((relativePath) => {
				const absolutePath = join(workspaceRoot, relativePath);
				try {
					const details = statSync(absolutePath);
					if (!details.isFile()) {
						return null;
					}
					return {
						absolutePath,
						relativePath,
						mode: details.mode & 0o777,
					};
				} catch {
					return null;
				}
			})
			.filter((file): file is WorkspaceFile => file !== null)
			.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	}

	return listFallbackWorkspaceFiles(workspaceRoot);
}

function readManifest(filePath: string) {
	return JSON.parse(readFileSync(filePath, "utf8")) as SnapshotManifest;
}

export class WorkspaceSnapshotStore implements WorkspaceSnapshotStoreLike {
	private snapshotsDir: string;

	constructor(private workspaceRoot: string, snapshotsDir = getSnapshotsDir(workspaceRoot)) {
		this.snapshotsDir = snapshotsDir;
	}

	private getSnapshotDir(snapshotId: string) {
		return join(this.snapshotsDir, snapshotId);
	}

	private getManifestPath(snapshotId: string) {
		return join(this.getSnapshotDir(snapshotId), "manifest.json");
	}

	has(snapshotId: string) {
		return existsSync(this.getManifestPath(snapshotId));
	}

	pruneReferencedSnapshotIds(snapshotIds: Iterable<string>) {
		if (!existsSync(this.snapshotsDir)) {
			return;
		}

		const retained = new Set(snapshotIds);
		for (const entry of readdirSync(this.snapshotsDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || retained.has(entry.name)) {
				continue;
			}
			rmSync(join(this.snapshotsDir, entry.name), { recursive: true, force: true });
		}
	}

	capture() {
		const snapshotId = randomUUID();
		const snapshotDir = this.getSnapshotDir(snapshotId);
		const filesDir = join(snapshotDir, "files");
		const files = listWorkspaceFiles(this.workspaceRoot);

		mkdirSync(filesDir, { recursive: true, mode: 0o700 });

		for (const file of files) {
			const destinationPath = join(filesDir, file.relativePath);
			mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });
			copyFileSync(file.absolutePath, destinationPath);
			chmodSync(destinationPath, file.mode);
		}

		writeFileSync(
			this.getManifestPath(snapshotId),
			JSON.stringify(
				{
					v: 1,
					files: files.map((file) => ({
						path: file.relativePath,
						mode: file.mode,
					})),
				} satisfies SnapshotManifest,
				null,
				2,
			),
			"utf8",
		);

		return snapshotId;
	}

	restore(snapshotId: string) {
		const snapshotDir = this.getSnapshotDir(snapshotId);
		const filesDir = join(snapshotDir, "files");
		const manifestPath = this.getManifestPath(snapshotId);
		if (!existsSync(manifestPath)) {
			throw new Error(`Snapshot not found: ${snapshotId}`);
		}

		const manifest = readManifest(manifestPath);
		const snapshotPaths = new Set(manifest.files.map((file) => file.path));
		const currentFiles = listWorkspaceFiles(this.workspaceRoot);

		for (const file of currentFiles) {
			if (snapshotPaths.has(file.relativePath)) {
				continue;
			}
			rmSync(file.absolutePath, { force: true });
		}

		for (const file of manifest.files) {
			const sourcePath = join(filesDir, file.path);
			const destinationPath = join(this.workspaceRoot, file.path);
			mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });
			copyFileSync(sourcePath, destinationPath);
			chmodSync(destinationPath, file.mode);
		}
	}
}

export function createWorkspaceSnapshotStore(
	options: WorkspaceSnapshotStoreOptions,
): WorkspaceSnapshotStoreLike {
	return new WorkspaceSnapshotStore(options.workspaceRoot, options.snapshotsDir);
}
