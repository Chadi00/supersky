import type { CliRenderer } from "@opentui/core";

import { copyToClipboard } from "./clipboard";

export type CopyToastApi = {
	show: (input: {
		message: string;
		variant: "info" | "success" | "warning" | "error";
	}) => void;
	error: (err: unknown) => void;
};

/** Same behavior as OpenCode `Selection.copy`: copy selection, toast, clear selection. */
export function copySelection(
	renderer: CliRenderer,
	toast: CopyToastApi,
): boolean {
	const text = renderer.getSelection()?.getSelectedText();
	if (!text) return false;

	copyToClipboard(text)
		.then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
		.catch(toast.error);

	renderer.clearSelection();
	return true;
}
