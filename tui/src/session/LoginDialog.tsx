import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import { colors } from "../shared/theme";

export type LoginDialogLineTone =
	| "text"
	| "muted"
	| "accent"
	| "warning"
	| "error";

export type LoginDialogLine = {
	id: string;
	text: string;
	tone: LoginDialogLineTone;
};

export type LoginDialogState = {
	providerId: string;
	providerName: string;
	lines: LoginDialogLine[];
	inputMode: "hidden" | "prompt" | "manual";
	inputPrompt?: string;
	inputPlaceholder?: string;
	inputValue: string;
};

type LoginDialogProps = {
	state: LoginDialogState;
	onInputChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
};

function getLineColor(tone: LoginDialogLineTone) {
	switch (tone) {
		case "accent":
			return colors.accentText;
		case "warning":
			return colors.warningText;
		case "error":
			return colors.warningText;
		case "muted":
			return colors.dimText;
		default:
			return colors.foregroundText;
	}
}

export function LoginDialog({
	state,
	onInputChange,
	onSubmit,
	onCancel,
}: LoginDialogProps) {
	const { width, height } = useTerminalDimensions();
	const dialogWidth = Math.max(48, Math.min(80, width - 6));
	const visibleLineCount = Math.max(1, Math.min(10, state.lines.length || 1));

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
			zIndex={200}
		>
			<box
				width={dialogWidth}
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
				<text fg={colors.warningText}>Login to {state.providerName}</text>
				<text fg={colors.dimText} marginBottom={1}>
					Press Esc to cancel.
				</text>

				<scrollbox
					height={visibleLineCount}
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
						{state.lines.length > 0 ? (
							state.lines.map((line) => (
								<text
									key={line.id}
									fg={getLineColor(line.tone)}
									wrapMode="word"
								>
									{line.text}
								</text>
							))
						) : (
							<text fg={colors.dimText}>
								Waiting for provider instructions...
							</text>
						)}
					</box>
				</scrollbox>

				{state.inputMode !== "hidden" ? (
					<box flexDirection="column" marginTop={1}>
						{state.inputPrompt ? (
							<text fg={colors.foregroundText} marginBottom={1} wrapMode="word">
								{state.inputPrompt}
							</text>
						) : null}

						<box border borderColor={colors.commandMenuBorder}>
							<input
								value={state.inputValue}
								placeholder={state.inputPlaceholder ?? ""}
								focused
								onChange={onInputChange}
								onSubmit={() => {
									onSubmit();
								}}
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
				) : null}
			</box>
		</box>
	);
}
