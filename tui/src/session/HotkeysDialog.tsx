import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import type { HotkeyEntry } from "../app/hotkeys";
import { colors } from "../shared/theme";

const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 150);

type HotkeysDialogProps = {
	entries: HotkeyEntry[];
	onClose: () => void;
};

export function HotkeysDialog({ entries, onClose }: HotkeysDialogProps) {
	const { width, height } = useTerminalDimensions();
	const dialogWidth = Math.max(56, Math.min(88, width - 2));
	const visibleRowCount = Math.max(6, Math.min(entries.length + 1, height - 8));

	useKeyboard((key) => {
		if (key.defaultPrevented) {
			return;
		}

		if (key.name === "escape" || key.name === "return") {
			key.preventDefault();
			key.stopPropagation();
			onClose();
		}
	});

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			zIndex={220}
			justifyContent="center"
			alignItems="center"
			backgroundColor={OVERLAY_BACKGROUND}
		>
			<box
				width={dialogWidth}
				maxWidth={Math.max(1, width - 2)}
				maxHeight={Math.max(12, height - 4)}
				flexDirection="column"
				backgroundColor={colors.panelBackground}
				border
				borderColor={colors.commandMenuBorder}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
			>
				<box flexDirection="row" justifyContent="space-between">
					<text fg={colors.foregroundText} attributes={TextAttributes.BOLD}>
						Supersky hotkeys
					</text>
					<text fg={colors.dimText}>esc/enter</text>
				</box>
				<text fg={colors.dimText} paddingTop={1} paddingBottom={1}>
					Available keyboard shortcuts in supersky.
				</text>
				<scrollbox
					height={visibleRowCount}
					focused={false}
					scrollX={false}
					style={{
						rootOptions: { backgroundColor: colors.panelBackground },
						wrapperOptions: { backgroundColor: colors.panelBackground },
						viewportOptions: { backgroundColor: colors.panelBackground },
						contentOptions: { backgroundColor: colors.panelBackground },
						scrollbarOptions: { visible: false },
						verticalScrollbarOptions: { visible: false },
						horizontalScrollbarOptions: { visible: false },
					}}
				>
					<box flexDirection="column">
						{entries.map((entry) => (
							<box
								key={`${entry.shortcut}:${entry.action}`}
								flexDirection="row"
							>
								<box width={20} flexShrink={0}>
									<text fg={colors.accentText}>{entry.shortcut}</text>
								</box>
								<box flexGrow={1}>
									<text fg={colors.foregroundText}>{entry.action}</text>
								</box>
							</box>
						))}
					</box>
				</scrollbox>
			</box>
		</box>
	);
}
