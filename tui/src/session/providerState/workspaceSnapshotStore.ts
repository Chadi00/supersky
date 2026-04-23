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
import { createPatch } from "diff";

import { getWorkspaceDir } from "./paths";

type SnapshotManifestFile = {
	path: string;
	mode: number;
};

type SnapshotManifest = {
	v: 1;
	files: SnapshotManifestFile[];
};

export type WorkspaceSnapshotPatch = {
	snapshotId: string;
	files: string[];
};

export interface WorkspaceSnapshotStoreLike {
	track(): string;
	patch(snapshotId: string): WorkspaceSnapshotPatch;
	restore(snapshotId: string): void;
	revert(patches: WorkspaceSnapshotPatch[]): void;
	diff(snapshotId: string): string;
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

type SnapshotFile = {
	path: string;
	mode: number;
	content: string;
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

function readFileIfExists(filePath: string) {
	try {
		return readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

function createSnapshotPatchText(path: string, before: string, after: string) {
	return createPatch(path, before, after, "before", "after");
}

export class WorkspaceSnapshotStore implements WorkspaceSnapshotStoreLike {
	private snapshotsDir: string;

	constructor(workspaceRoot: string, snapshotsDir = getSnapshotsDir(workspaceRoot)) {
		this.workspaceRoot = workspaceRoot;
		this.snapshotsDir = snapshotsDir;
	}

	private workspaceRoot: string;

	private getSnapshotDir(snapshotId: string) {
		return join(this.snapshotsDir, snapshotId);
	}

	private getFilesDir(snapshotId: string) {
		return join(this.getSnapshotDir(snapshotId), "files");
	}

	private getManifestPath(snapshotId: string) {
		return join(this.getSnapshotDir(snapshotId), "manifest.json");
	}

	private listSnapshotFiles(snapshotId: string) {
		const manifestPath = this.getManifestPath(snapshotId);
		if (!existsSync(manifestPath)) {
			throw new Error(`Snapshot not found: ${snapshotId}`);
		}
		const manifest = readManifest(manifestPath);
		const filesDir = this.getFilesDir(snapshotId);
		const result = new Map<string, SnapshotFile>();
		for (const file of manifest.files) {
			result.set(file.path, {
				path: file.path,
				mode: file.mode,
				content: readFileSync(join(filesDir, file.path), "utf8"),
			});
		}
		return result;
	}

	private restoreSingleFile(snapshotId: string, relativePath: string) {
		const snapshotFiles = this.listSnapshotFiles(snapshotId);
		const snapshotFile = snapshotFiles.get(relativePath);
		const destinationPath = join(this.workspaceRoot, relativePath);
		if (!snapshotFile) {
			rmSync(destinationPath, { force: true });
			return;
		}

		const sourcePath = join(this.getFilesDir(snapshotId), relativePath);
		mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });
		copyFileSync(sourcePath, destinationPath);
		chmodSync(destinationPath, snapshotFile.mode);
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

	track() {
		const snapshotId = randomUUID();
		const snapshotDir = this.getSnapshotDir(snapshotId);
		const filesDir = this.getFilesDir(snapshotId);
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

	patch(snapshotId: string) {
		const snapshotFiles = this.listSnapshotFiles(snapshotId);
		const currentFiles = listWorkspaceFiles(this.workspaceRoot);
		const currentByPath = new Map(
			currentFiles.map((file) => [file.relativePath, file] as const),
		);
		const paths = new Set<string>([
			...snapshotFiles.keys(),
			...currentByPath.keys(),
		]);

		const files = [...paths]
			.filter((relativePath) => {
				const snapshotFile = snapshotFiles.get(relativePath);
				const currentFile = currentByPath.get(relativePath);
				if (!snapshotFile || !currentFile) {
					return true;
				}
				const currentContent = readFileSync(currentFile.absolutePath, "utf8");
				return (
					snapshotFile.content !== currentContent ||
					snapshotFile.mode !== currentFile.mode
				);
			})
			.toSorted((left, right) => left.localeCompare(right));

		return {
			snapshotId,
			files,
		};
	}

	restore(snapshotId: string) {
		const snapshotDir = this.getSnapshotDir(snapshotId);
		const filesDir = this.getFilesDir(snapshotId);
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

	revert(patches: WorkspaceSnapshotPatch[]) {
		const restored = new Set<string>();
		for (const patch of patches) {
			for (const relativePath of patch.files) {
				if (restored.has(relativePath)) {
					continue;
				}
				restored.add(relativePath);
				this.restoreSingleFile(patch.snapshotId, relativePath);
			}
		}
	}

	diff(snapshotId: string) {
		const snapshotFiles = this.listSnapshotFiles(snapshotId);
		const currentFiles = listWorkspaceFiles(this.workspaceRoot);
		const currentByPath = new Map(
			currentFiles.map((file) => [file.relativePath, file] as const),
		);
		const paths = new Set<string>([
			...snapshotFiles.keys(),
			...currentByPath.keys(),
		]);

		const patches: string[] = [];
		for (const relativePath of [...paths].toSorted((left, right) => left.localeCompare(right))) {
			const snapshotFile = snapshotFiles.get(relativePath);
			const currentFile = currentByPath.get(relativePath);
			const before = snapshotFile?.content ?? "";
			const after = currentFile ? readFileIfExists(currentFile.absolutePath) ?? "" : "";
			const beforeExists = Boolean(snapshotFile);
			const afterExists = Boolean(currentFile);

			if (
				beforeExists === afterExists &&
				before === after &&
				snapshotFile?.mode === currentFile?.mode
			) {
				continue;
			}

			patches.push(createSnapshotPatchText(relativePath, before, after));
		}

		return patches.join("\n").trim();
	}
}

export function createWorkspaceSnapshotStore(
	options: WorkspaceSnapshotStoreOptions,
): WorkspaceSnapshotStoreLike {
	return new WorkspaceSnapshotStore(options.workspaceRoot, options.snapshotsDir);
}
