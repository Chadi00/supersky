import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { colors } from "../shared/theme";

export type SessionRenameDialogState = {
	sessionId: string;
	value: string;
	returnToSessionsDialog?: boolean;
};

type SessionRenameDialogProps = {
	state: SessionRenameDialogState;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
};

export function SessionRenameDialog({
	state,
	onInputChange,
	onSubmit,
	onCancel,
}: SessionRenameDialogProps) {
	const { width } = useTerminalDimensions();
	const dialogWidth = Math.max(40, Math.min(72, width - 6));

	useKeyboard((key) => {
		if (key.defaultPrevented) {
			return;
		}
		if (key.name === "escape" || (key.ctrl && key.name === "c")) {
			onCancel();
		}
	});

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			justifyContent="center"
			alignItems="center"
			zIndex={210}
		>
			<box
				width={dialogWidth}
				flexDirection="column"
				backgroundColor={colors.panelBackground}
				border
				borderColor={colors.commandMenuBorder}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				gap={1}
			>
				<text fg={colors.warningText}>Rename session</text>
				<text fg={colors.dimText}>Press Enter to save, Esc to cancel.</text>
				<box border borderColor={colors.commandMenuBorder}>
					<input
						value={state.value}
						placeholder="Session title"
						focused
						onChange={onInputChange}
						onSubmit={onSubmit}
						backgroundColor={colors.composerBackground}
						textColor={colors.foregroundText}
						focusedBackgroundColor={colors.composerBackground}
						focusedTextColor={colors.foregroundText}
						placeholderColor={colors.dimText}
						paddingLeft={1}
						paddingRight={1}
					/>
				</box>
			</box>
		</box>
	);
}
