import { useState } from "react";

import { colors } from "../shared/theme";
import { SIDEBAR_MIN_WIDTH } from "./layout";
import type { SessionModifiedFile } from "./sessionFileDiff";

const SIDEBAR_USAGE_LINE_KEYS = ["tokens", "percent", "cost"] as const;

type SessionSidebarProps = {
	sessionTitle: string;
	/** Context/cost lines (tokens, % used, $ spent) — from live session, pi-mono compatible. */
	usage: readonly string[];
	/** Files mutated in this session (`edit` / `write` tools), aggregated like OpenCode session diffs. */
	modifiedFiles: readonly SessionModifiedFile[];
	/** When false, never show the section. When true, the section is omitted if `modifiedFiles` is empty. */
	showModified?: boolean;
	onMouseDown?: () => void;
};

export function SessionSidebar({
	sessionTitle,
	usage,
	modifiedFiles,
	showModified = true,
	onMouseDown,
}: SessionSidebarProps) {
	const [modifiedFilesOpen, setModifiedFilesOpen] = useState(true);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Sidebar clicks refocus the composer textarea.
		<box
			width="100%"
			flexGrow={1}
			flexDirection="column"
			backgroundColor={colors.panelBackground}
			padding={1}
			gap={1}
			minWidth={SIDEBAR_MIN_WIDTH}
			onMouseDown={() => {
				onMouseDown?.();
			}}
		>
			<text fg={colors.foregroundText}>
				<strong>{sessionTitle}</strong>
			</text>
			<box flexDirection="column" gap={0}>
				{usage.map((entry, index) => (
					<text
						key={SIDEBAR_USAGE_LINE_KEYS[index] ?? `usage-extra-${index}`}
						fg={colors.dimText}
					>
						{entry}
					</text>
				))}
			</box>
			{showModified && modifiedFiles.length > 0 ? (
				<box flexDirection="column" gap={0}>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Toggle modified-files section visibility. */}
					<box
						flexDirection="row"
						gap={1}
						alignItems="center"
						onMouseDown={(event) => {
							if (event.button !== 0) {
								return;
							}
							event.stopPropagation();
							setModifiedFilesOpen((open) => !open);
							onMouseDown?.();
						}}
					>
						<text fg={colors.dimText}>{modifiedFilesOpen ? "▼" : "▶"}</text>
						<text fg={colors.dimText}>Modified files</text>
					</box>
					{modifiedFilesOpen
						? modifiedFiles.map((file) => (
								<box
									key={file.path}
									width="100%"
									flexDirection="row"
									justifyContent="space-between"
									gap={1}
								>
									<box flexGrow={1} flexShrink={1} minWidth={0}>
										<text fg={colors.dimText}>{file.path}</text>
									</box>
									<box flexShrink={0}>
										<text>
											{file.deleted ? (
												<span fg={colors.diffDeleteText}>deleted</span>
											) : null}
											{file.deleted &&
											(file.additions > 0 || file.deletions > 0) ? (
												<span fg={colors.dimText}> </span>
											) : null}
											{file.additions > 0 ? (
												<span fg={colors.successText}>+{file.additions}</span>
											) : null}
											{file.additions > 0 && file.deletions > 0 ? (
												<span fg={colors.dimText}> </span>
											) : null}
											{file.deletions > 0 ? (
												<span fg={colors.diffDeleteText}>
													-{file.deletions}
												</span>
											) : null}
											{!file.deleted &&
											file.additions === 0 &&
											file.deletions === 0 ? (
												<span fg={colors.dimText}>—</span>
											) : null}
										</text>
									</box>
								</box>
							))
						: null}
				</box>
			) : null}
			<box flexGrow={1} />
		</box>
	);
}
