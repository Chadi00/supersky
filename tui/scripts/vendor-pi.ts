import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

const superskyRoot = "/Users/chadiek/projects/supersky/tui";
const piMonoRoot = "/Users/chadiek/projects/pi-mono";

type CopyOptions = {
	replacements?: Array<[from: string | RegExp, to: string]>;
};

async function exists(target: string) {
	try {
		await stat(target);
		return true;
	} catch {
		return false;
	}
}

async function copyTree(
	source: string,
	destination: string,
	options: CopyOptions = {},
) {
	const sourceStat = await stat(source);
	if (sourceStat.isDirectory()) {
		await mkdir(destination, { recursive: true });
		const entries = await readdir(source, { withFileTypes: true });
		for (const entry of entries) {
			await copyTree(
				path.join(source, entry.name),
				path.join(destination, entry.name),
				options,
			);
		}
		return;
	}

	const raw = await readFile(source, "utf8");
	let next = raw;
	for (const [from, to] of options.replacements ?? []) {
		next = next.replaceAll(from as never, to);
	}
	if (source.endsWith(".ts") && !next.startsWith("// @ts-nocheck\n")) {
		next = `// @ts-nocheck\n${next}`;
	}
	await mkdir(path.dirname(destination), { recursive: true });
	await writeFile(destination, next, "utf8");
}

async function main() {
	const vendorRoot = path.join(superskyRoot, "src/vendor");
	const piAiTarget = path.join(vendorRoot, "pi-ai");
	const piAgentTarget = path.join(vendorRoot, "pi-agent-core");

	if (await exists(piAiTarget)) {
		await rm(piAiTarget, { recursive: true, force: true });
	}
	if (await exists(piAgentTarget)) {
		await rm(piAgentTarget, { recursive: true, force: true });
	}

	await copyTree(path.join(piMonoRoot, "packages/ai/src"), piAiTarget);

	await copyTree(path.join(piMonoRoot, "packages/agent/src"), piAgentTarget, {
		replacements: [
			[/from "@mariozechner\/pi-ai"/g, 'from "../pi-ai/index.js"'],
		],
	});
}

await main();
