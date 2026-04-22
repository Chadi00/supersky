import { useState } from "react";

import { sidebarData } from "../app/config";
import { colors } from "../shared/theme";
import { SIDEBAR_MIN_WIDTH } from "./layout";

const SIDEBAR_USAGE_LINE_KEYS = ["tokens", "percent", "cost"] as const;

type SessionSidebarProps = {
	sessionTitle: string;
	/** Context/cost lines (tokens, % used, $ spent) — from live session, pi-mono compatible. */
	usage: readonly string[];
	showModified?: boolean;
	onMouseDown?: () => void;
};

export function SessionSidebar({
	sessionTitle,
	usage,
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
			{showModified ? (
				<box flexDirection="column" gap={0}>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Toggle modified-files section visibility. */}
					<box
						flexDirection="row"
						onMouseDown={(event) => {
							if (event.button !== 0) {
								return;
							}
							event.stopPropagation();
							setModifiedFilesOpen((open) => !open);
							onMouseDown?.();
						}}
					>
						<text fg={colors.dimText}>
							Modified files{" "}
							<span fg={colors.dimText}>{modifiedFilesOpen ? "▼" : "▶"}</span>
						</text>
					</box>
					{modifiedFilesOpen
						? sidebarData.modifiedFiles.map((file) => (
								<text key={file.path}>
									<span fg={colors.successText}>{file.delta}</span>
									<span fg={colors.dimText}> {file.path}</span>
								</text>
							))
						: null}
				</box>
			) : null}
			<box flexGrow={1} />
		</box>
	);
}
