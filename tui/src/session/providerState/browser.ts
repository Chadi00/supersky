import { exec } from "node:child_process";

export function openUrlInBrowser(url: string) {
	const openCommand =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";

	exec(`${openCommand} "${url}"`);
}
