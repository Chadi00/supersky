import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 150);
const PANEL_BACKGROUND = "#141414";
const TEXT = "#eeeeee";
const MUTED_TEXT = "#808080";
const SELECTED_BACKGROUND = "#fab283";
const SELECTED_TEXT = "#0a0a0a";
const DISABLED_TEXT = "#5a5a5a";

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
		const index = (startIndex + offset * direction + options.length) % options.length;
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
	const dialogWidth = Math.max(40, Math.min(56, width - 2));

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
			setSelectedIndex((current) => getNextEnabledIndex(options, current - 1, -1));
			return;
		}

		if (key.name === "down") {
			key.preventDefault();
			key.stopPropagation();
			setSelectedIndex((current) => getNextEnabledIndex(options, current + 1, 1));
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
				padding={1}
				gap={1}
			>
				<box flexDirection="row" justifyContent="space-between">
					<text fg={TEXT} attributes={TextAttributes.BOLD}>
						Message Actions
					</text>
					<text fg={MUTED_TEXT}>esc</text>
				</box>
				<box flexDirection="column">
					{options.map((option, index) => {
						const isSelected = index === selectedIndex;
						const textColor = option.disabled
							? DISABLED_TEXT
							: isSelected
								? SELECTED_TEXT
								: TEXT;
						return (
							<box
								key={option.id}
								id={`message-action-${option.id}`}
								flexDirection="column"
								backgroundColor={isSelected ? SELECTED_BACKGROUND : PANEL_BACKGROUND}
								paddingX={1}
								paddingY={1}
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
								<text fg={textColor} attributes={TextAttributes.BOLD}>
									{option.label}
								</text>
								<text fg={option.disabled ? DISABLED_TEXT : MUTED_TEXT}>
									{option.description}
								</text>
							</box>
						);
					})}
				</box>
			</box>
		</box>
	);
}
