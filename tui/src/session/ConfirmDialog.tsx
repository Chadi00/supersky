import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors } from "../shared/theme";

const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 150);

export type ConfirmDialogProps = {
	title: string;
	message: string;
	confirmHint?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export function ConfirmDialog({
	title,
	message,
	confirmHint = "enter · confirm    esc · cancel",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const { width } = useTerminalDimensions();
	const dialogWidth = Math.max(48, Math.min(84, width - 6));

	useKeyboard((key) => {
		if (key.defaultPrevented) {
			return;
		}

		if (key.name === "escape" || (key.ctrl && key.name === "c")) {
			key.preventDefault();
			key.stopPropagation();
			onCancel();
			return;
		}

		if (key.name === "return") {
			key.preventDefault();
			key.stopPropagation();
			onConfirm();
		}
	});

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			zIndex={215}
			justifyContent="center"
			alignItems="center"
			backgroundColor={OVERLAY_BACKGROUND}
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
				<text fg={colors.foregroundText} attributes={TextAttributes.BOLD}>
					{title}
				</text>
				<text fg={colors.dimText}>{message}</text>
				<text fg={colors.dimText}>{confirmHint}</text>
			</box>
		</box>
	);
}
