import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

import { colors } from "../shared/theme";

const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 176);
const PANEL_BACKGROUND = colors.panelBackground;
const PANEL_BORDER = colors.commandMenuBorder;
const TEXT = colors.foregroundText;
const MUTED_TEXT = colors.dimText;
const SELECTED_BACKGROUND = colors.commandMenuSelectedBackground;
const SELECTED_TEXT = colors.commandMenuSelectedText;
const SELECTED_BORDER = colors.accentText;
const DISABLED_TEXT = colors.mutedText;

export type MessageActionOption = {
	id: string;
	label: string;
	description: string;
	disabled?: boolean;
	onSelect: () => void | Promise<void>;
};

type MessageActionsDialogProps = {
	options: MessageActionOption[];
	onClose: () => void;
};

function getNextEnabledIndex(
	options: MessageActionOption[],
	startIndex: number,
	direction: 1 | -1,
) {
	if (options.length === 0) {
		return -1;
	}

	for (let offset = 0; offset < options.length; offset += 1) {
		const index =
			(startIndex + offset * direction + options.length) % options.length;
		if (!options[index]?.disabled) {
			return index;
		}
	}

	return -1;
}

export function MessageActionsDialog({
	options,
	onClose,
}: MessageActionsDialogProps) {
	const { width } = useTerminalDimensions();
	const enabledDefaultIndex = useMemo(
		() => getNextEnabledIndex(options, 0, 1),
		[options],
	);
	const [selectedIndex, setSelectedIndex] = useState(enabledDefaultIndex);

	useEffect(() => {
		setSelectedIndex(enabledDefaultIndex);
	}, [enabledDefaultIndex]);

	const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
	const dialogWidth = Math.max(1, Math.min(64, width - 2));

	useKeyboard((key) => {
		if (key.defaultPrevented) {
			return;
		}

		if (key.name === "escape") {
			key.preventDefault();
			key.stopPropagation();
			onClose();
			return;
		}

		if (key.name === "up") {
			key.preventDefault();
			key.stopPropagation();
			setSelectedIndex((current) =>
				getNextEnabledIndex(options, current - 1, -1),
			);
			return;
		}

		if (key.name === "down") {
			key.preventDefault();
			key.stopPropagation();
			setSelectedIndex((current) =>
				getNextEnabledIndex(options, current + 1, 1),
			);
			return;
		}

		if (key.name === "return" || key.name === "enter") {
			if (!selectedOption || selectedOption.disabled) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			void selectedOption.onSelect();
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
				flexDirection="column"
				backgroundColor={PANEL_BACKGROUND}
				border
				borderColor={PANEL_BORDER}
				paddingLeft={1}
				paddingRight={1}
				paddingTop={1}
				paddingBottom={1}
				gap={1}
			>
				<box flexDirection="column">
					<text fg={TEXT} attributes={TextAttributes.BOLD}>
						Actions
					</text>
					<text fg={MUTED_TEXT}>Enter to select. Esc to close.</text>
				</box>
				<box flexDirection="column">
					{options.map((option, index) => {
						const isSelected = index === selectedIndex;
						const labelColor = option.disabled
							? DISABLED_TEXT
							: isSelected
								? SELECTED_TEXT
								: TEXT;
						const descriptionColor = option.disabled
							? DISABLED_TEXT
							: isSelected
								? SELECTED_TEXT
								: MUTED_TEXT;
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive message-action primitive here.
							<box
								key={option.id}
								id={`message-action-${option.id}`}
								border={["left"]}
								borderColor={isSelected ? SELECTED_BORDER : PANEL_BORDER}
								flexDirection="column"
								backgroundColor={
									isSelected ? SELECTED_BACKGROUND : PANEL_BACKGROUND
								}
								paddingLeft={1}
								paddingRight={1}
								onMouseMove={() => {
									if (!option.disabled) {
										setSelectedIndex(index);
									}
								}}
								onMouseUp={(event) => {
									if (event.button !== 0 || option.disabled) {
										return;
									}
									event.preventDefault();
									event.stopPropagation();
									void option.onSelect();
								}}
							>
								<box flexDirection="row" gap={1}>
									<text fg={labelColor} attributes={TextAttributes.BOLD}>
										{option.label}
									</text>
									<text fg={descriptionColor} wrapMode="word">
										{option.description}
									</text>
								</box>
							</box>
						);
					})}
				</box>
			</box>
		</box>
	);
}
