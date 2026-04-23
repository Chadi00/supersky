import { TextAttributes } from "@opentui/core";
import { colors } from "../shared/theme";

type RevertDiffFile = {
	filename: string;
	additions: number;
	deletions: number;
};

type SessionRevertBannerProps = {
	hiddenUserMessageCount: number;
	files: RevertDiffFile[];
	onRedo: () => void;
};

export function SessionRevertBanner({
	hiddenUserMessageCount,
	files,
	onRedo,
}: SessionRevertBannerProps) {
	return (
		<box
			id="session-revert-banner"
			flexDirection="column"
			paddingX={2}
			paddingY={1}
			backgroundColor={colors.panelBackground}
			border
			borderColor={colors.toolBorder}
			gap={0}
		>
			<text fg={colors.dimText}>
				{`${hiddenUserMessageCount} message${hiddenUserMessageCount === 1 ? "" : "s"} reverted`}
			</text>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive redo primitive here. */}
			<box
				id="session-revert-redo"
				onMouseUp={(event) => {
					if (event.button !== 0) {
						return;
					}
					event.preventDefault();
					event.stopPropagation();
					onRedo();
				}}
			>
				<text fg={colors.foregroundText}>
					<span fg={colors.accentText} attributes={TextAttributes.BOLD}>
						Redo
					</span>
					<span fg={colors.dimText}>{" to restore"}</span>
				</text>
			</box>
			{files.length > 0 ? (
				<box flexDirection="column" marginTop={1}>
					{files.map((file) => (
						<text key={file.filename} fg={colors.foregroundText}>
							{file.filename}
							{file.additions > 0 ? (
								<span fg={colors.successText}>{` +${file.additions}`}</span>
							) : null}
							{file.deletions > 0 ? (
								<span fg={colors.diffDeleteText}>{` -${file.deletions}`}</span>
							) : null}
						</text>
					))}
				</box>
			) : null}
		</box>
	);
}
