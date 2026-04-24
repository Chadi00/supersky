import cliSpinners from "cli-spinners";
import { colors } from "../shared/theme";
import { useSpinnerFrame } from "../shared/useBrailleSpinnerFrame";
import { appMetadata } from "./config";

type AppFooterProps = {
	isNewSession: boolean;
	isRunning: boolean;
	activityLabel?: string | null;
	projectLine: string;
	modelName: string | null;
	onMouseDown?: () => void;
};

export function AppFooter({
	isNewSession,
	isRunning,
	activityLabel,
	projectLine,
	modelName,
	onMouseDown,
}: AppFooterProps) {
	const footerSpinner = cliSpinners.dots12;
	const spinnerFrame = useSpinnerFrame(
		footerSpinner.frames,
		isRunning,
		footerSpinner.interval,
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Footer clicks return focus to the composer.
		<box
			flexDirection="row"
			justifyContent="space-between"
			alignItems="center"
			flexShrink={0}
			paddingX={2}
			paddingTop={isNewSession ? 1 : 0}
			paddingBottom={1}
			onMouseDown={() => {
				onMouseDown?.();
			}}
		>
			<box flexDirection="row" alignItems="center" gap={1} minWidth={0}>
				{isRunning ? <text fg={colors.accentText}>{spinnerFrame}</text> : null}
				{isRunning && activityLabel ? (
					<text fg={colors.accentText}>{activityLabel}</text>
				) : null}
				<text fg={colors.mutedText}>{projectLine}</text>
			</box>
			<text>
				<span fg={colors.warningText}>{modelName ?? "No model"}</span>
				<span fg={colors.mutedText}> · </span>
				<span fg={colors.mutedText}>{appMetadata.version}</span>
			</text>
		</box>
	);
}
