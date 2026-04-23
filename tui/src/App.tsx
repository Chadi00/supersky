import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef } from "react";

import { AppFooter } from "./app/AppFooter";
import { copyToClipboard } from "./app/clipboard";
import { copySelection } from "./app/copySelection";
import { Toast, ToastProvider, useToast } from "./app/Toast";
import { Composer, type ComposerHandle } from "./session/Composer";
import { InlineCommandPickerDialog } from "./session/InlineCommandPickerDialog";
import { LoginDialog } from "./session/LoginDialog";
import { deriveSessionLayout } from "./session/layout";
import { MessageActionsDialog } from "./session/MessageActionsDialog";
import { MessageList } from "./session/MessageList";
import type { SessionServices } from "./session/providerState/services";
import { getRevertDiffFiles } from "./session/revertDiff";
import { SessionPickerDialog } from "./session/SessionPickerDialog";
import { SessionRenameDialog } from "./session/SessionRenameDialog";
import { SessionRevertBanner } from "./session/SessionRevertBanner";
import { SessionSidebar } from "./session/SessionSidebar";
import { useSessionController } from "./session/useSessionController";
import { WelcomeScreen } from "./session/WelcomeScreen";
import { colors } from "./shared/theme";

type AppProps = {
	projectLine: string;
	services?: SessionServices;
	initialSessionId?: string | null;
};

export function App(props: AppProps) {
	return (
		<ToastProvider>
			<AppContent {...props} />
		</ToastProvider>
	);
}

function AppContent({ projectLine, services, initialSessionId }: AppProps) {
	const { width } = useTerminalDimensions();
	const renderer = useRenderer();
	const toast = useToast();
	const {
		state,
		visibleMessages,
		revertBannerState,
		sessionSidebarUsage,
		sessionSidebarModifiedFiles,
		isNewSession,
		hasSubmittedUserMessages,
		isBrowsingHistory,
		commandNotice,
		dismissComposerMenuToken,
		setComposerMenuOpen,
		setDraft,
		submit,
		showPreviousHistory,
		showNextHistory,
		sessionTitle,
		activeModel,
		toolDefinitions,
		availableProviderCount,
		commandPickerState,
		closeCommandPicker,
		selectCommandPickerItem,
		copySessionIdFromPicker,
		openSessionRenameDialog,
		toggleSessionDelete,
		clearPendingSessionDelete,
		loginDialogState,
		setLoginDialogInputValue,
		submitLoginDialogInput,
		cancelLoginDialog,
		sessionRenameDialogState,
		setSessionRenameValue,
		submitSessionRename,
		cancelSessionRename,
		messageActionsState,
		openMessageActions,
		closeMessageActions,
		copyMessageFromActions,
		forkSessionFromMessage,
		revertSessionToMessage,
		redoSessionRevert,
	} = useSessionController(services, initialSessionId ?? null);
	const layout = deriveSessionLayout(width, isNewSession);
	const composerRef = useRef<ComposerHandle>(null);
	const sessionPickerState =
		commandPickerState?.kind === "sessions" ? commandPickerState : null;
	const dialogCommandPickerState =
		commandPickerState && commandPickerState.kind !== "sessions"
			? commandPickerState
			: null;
	const hasModalOpen =
		loginDialogState !== null ||
		sessionRenameDialogState !== null ||
		dialogCommandPickerState !== null ||
		sessionPickerState !== null ||
		messageActionsState !== null;
	const modelLabel = activeModel
		? availableProviderCount > 1
			? `(${activeModel.provider}) ${activeModel.id}`
			: activeModel.id
		: null;
	const focusComposer = useCallback(() => {
		composerRef.current?.focus();
	}, []);
	const revertDiffFiles = revertBannerState
		? getRevertDiffFiles(revertBannerState.diff)
		: [];

	useEffect(() => {
		renderer.console.onCopySelection = (text: string) => {
			void (async () => {
				if (!text || text.length === 0) return;
				try {
					await copyToClipboard(text);
					toast.show({ message: "Copied to clipboard", variant: "info" });
				} catch (e) {
					toast.error(e);
				}
				renderer.clearSelection();
			})();
		};
		return () => {
			renderer.console.onCopySelection = undefined;
		};
	}, [renderer, toast]);

	const handleRootMouseUp = useCallback(() => {
		copySelection(renderer, toast);
	}, [renderer, toast]);

	const handleUserMessageMouseUp = useCallback(
		(message: Parameters<typeof openMessageActions>[0]) => {
			if (renderer.getSelection()?.getSelectedText()) {
				return;
			}
			openMessageActions(message);
		},
		[openMessageActions, renderer],
	);

	useEffect(() => {
		if (!commandNotice) {
			return;
		}

		toast.show({ message: commandNotice, variant: "info" });
	}, [commandNotice, toast]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Copy-on-mouse-up for terminal selection (OpenCode pattern).
		<box
			width="100%"
			height="100%"
			flexDirection="column"
			backgroundColor={colors.background}
			onMouseUp={handleRootMouseUp}
		>
			<box flexGrow={1} flexDirection="column" minHeight={0}>
				{isNewSession ? (
					<WelcomeScreen
						bannerText={layout.welcomeBannerText}
						composerWidth={layout.welcomeComposerWidth}
						draft={state.draft}
						dismissComposerMenuToken={dismissComposerMenuToken}
						onComposerMenuOpenChange={setComposerMenuOpen}
						resetToken={state.composerResetToken}
						onDraftChange={setDraft}
						onSubmit={submit}
						historyAvailable={hasSubmittedUserMessages}
						isBrowsingHistory={isBrowsingHistory}
						onHistoryPrevious={showPreviousHistory}
						onHistoryNext={showNextHistory}
						commandPickerState={null}
						onCommandPickerClose={closeCommandPicker}
						onCommandPickerSelect={selectCommandPickerItem}
						composerRef={composerRef}
						onSurfaceMouseDown={focusComposer}
						composerFocused={!hasModalOpen}
					/>
				) : (
					<box
						flexGrow={1}
						flexDirection={layout.showSidebar ? "row" : "column"}
						alignItems="stretch"
						paddingX={1}
						paddingTop={layout.showSidebar ? 1 : 0}
						paddingBottom={1}
						gap={1}
						minHeight={0}
					>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: Refocus composer when clicking the session panel chrome. */}
						<box
							flexGrow={1}
							flexDirection="column"
							minHeight={0}
							minWidth={0}
							onMouseDown={focusComposer}
						>
							<MessageList
								messages={visibleMessages}
								pendingBashMessages={state.pendingBashMessages}
								pendingUserMessages={state.pendingUserMessages}
								streamingMessage={state.streamingMessage}
								isStreaming={state.isStreaming}
								toolExecutions={state.toolExecutions}
								toolDefinitions={toolDefinitions}
								onMouseDown={focusComposer}
								onUserMessageMouseUp={handleUserMessageMouseUp}
							/>

							{revertBannerState ? (
								<box paddingTop={1} flexShrink={0}>
									<SessionRevertBanner
										hiddenUserMessageCount={
											revertBannerState.hiddenUserMessageCount
										}
										files={revertDiffFiles}
										onRedo={redoSessionRevert}
									/>
								</box>
							) : null}

							<box paddingTop={0} flexShrink={0}>
								<Composer
									ref={composerRef}
									width="100%"
									draft={state.draft}
									dismissComposerMenuToken={dismissComposerMenuToken}
									onComposerMenuOpenChange={setComposerMenuOpen}
									resetToken={state.composerResetToken}
									onDraftChange={setDraft}
									onSubmit={submit}
									historyAvailable={hasSubmittedUserMessages}
									isBrowsingHistory={isBrowsingHistory}
									onHistoryPrevious={showPreviousHistory}
									onHistoryNext={showNextHistory}
									commandPickerState={null}
									onCommandPickerClose={closeCommandPicker}
									onCommandPickerSelect={selectCommandPickerItem}
									focused={!hasModalOpen}
								/>
							</box>
						</box>

						{layout.showSidebar ? (
							<box width={layout.sidebarWidth} flexShrink={0} minHeight={0}>
								<SessionSidebar
									sessionTitle={sessionTitle}
									usage={sessionSidebarUsage}
									modifiedFiles={sessionSidebarModifiedFiles}
									onMouseDown={focusComposer}
								/>
							</box>
						) : null}
					</box>
				)}
			</box>

			<AppFooter
				isNewSession={isNewSession}
				isRunning={state.isStreaming}
				projectLine={projectLine}
				modelName={modelLabel}
				onMouseDown={focusComposer}
			/>

			{loginDialogState ? (
				<LoginDialog
					state={loginDialogState}
					onInputChange={setLoginDialogInputValue}
					onSubmit={submitLoginDialogInput}
					onCancel={cancelLoginDialog}
				/>
			) : null}

			{sessionRenameDialogState ? (
				<SessionRenameDialog
					state={sessionRenameDialogState}
					onInputChange={setSessionRenameValue}
					onSubmit={submitSessionRename}
					onCancel={cancelSessionRename}
				/>
			) : null}

			{sessionPickerState ? (
				<SessionPickerDialog
					state={sessionPickerState}
					onClose={closeCommandPicker}
					onSelect={selectCommandPickerItem}
					onRename={(sessionId) => {
						closeCommandPicker();
						openSessionRenameDialog(sessionId, {
							returnToSessionsDialog: true,
						});
					}}
					onCopy={copySessionIdFromPicker}
					onDelete={toggleSessionDelete}
					onClearPendingDelete={clearPendingSessionDelete}
				/>
			) : null}

			{dialogCommandPickerState ? (
				<InlineCommandPickerDialog
					state={dialogCommandPickerState}
					onClose={closeCommandPicker}
					onSelect={selectCommandPickerItem}
				/>
			) : null}

			{messageActionsState ? (
				<MessageActionsDialog
					onClose={closeMessageActions}
					options={[
						{
							id: "revert",
							label: "Revert",
							description:
								messageActionsState.revertDisabledReason ??
								"rewind to this prompt",
							disabled: Boolean(messageActionsState.revertDisabledReason),
							onSelect: revertSessionToMessage,
						},
						{
							id: "copy",
							label: "Copy",
							description: "copy prompt text",
							onSelect: copyMessageFromActions,
						},
						{
							id: "fork",
							label: "Fork",
							description:
								messageActionsState.forkDisabledReason ??
								"branch into a new session",
							disabled: Boolean(messageActionsState.forkDisabledReason),
							onSelect: forkSessionFromMessage,
						},
					]}
				/>
			) : null}

			<Toast />
		</box>
	);
}
