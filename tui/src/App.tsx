import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef } from "react";

import { AppFooter } from "./app/AppFooter";
import { copyToClipboard } from "./app/clipboard";
import { copySelection } from "./app/copySelection";
import { Toast, ToastProvider, useToast } from "./app/Toast";
import { Composer, type ComposerHandle } from "./session/Composer";
import { LoginDialog } from "./session/LoginDialog";
import { deriveSessionLayout } from "./session/layout";
import { MessageList } from "./session/MessageList";
import type { SessionServices } from "./session/providerState/services";
import { SessionSidebar } from "./session/SessionSidebar";
import { useSessionController } from "./session/useSessionController";
import { WelcomeScreen } from "./session/WelcomeScreen";
import { colors } from "./shared/theme";

type AppProps = {
  projectLine: string;
  services?: SessionServices;
};

export function App(props: AppProps) {
  return (
    <ToastProvider>
      <AppContent {...props} />
    </ToastProvider>
  );
}

function AppContent({ projectLine, services }: AppProps) {
  const { width } = useTerminalDimensions();
  const renderer = useRenderer();
  const toast = useToast();
  const {
    state,
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
    activeModel,
    availableProviderCount,
    commandPickerState,
    closeCommandPicker,
    selectCommandPickerItem,
    loginDialogState,
    setLoginDialogInputValue,
    submitLoginDialogInput,
    cancelLoginDialog,
  } = useSessionController(services);
  const layout = deriveSessionLayout(width, isNewSession);
  const composerRef = useRef<ComposerHandle>(null);
  const modelLabel = activeModel
    ? availableProviderCount > 1
      ? `(${activeModel.provider}) ${activeModel.id}`
      : activeModel.id
    : null;
  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

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
            commandPickerState={commandPickerState}
            onCommandPickerClose={closeCommandPicker}
            onCommandPickerSelect={selectCommandPickerItem}
            composerRef={composerRef}
            onSurfaceMouseDown={focusComposer}
            composerFocused={loginDialogState === null}
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
                messages={state.messages}
                onMouseDown={focusComposer}
              />

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
                  commandPickerState={commandPickerState}
                  onCommandPickerClose={closeCommandPicker}
                  onCommandPickerSelect={selectCommandPickerItem}
                  focused={loginDialogState === null}
                />
              </box>
            </box>

            {layout.showSidebar ? (
              <box width={layout.sidebarWidth} flexShrink={0} minHeight={0}>
                <SessionSidebar onMouseDown={focusComposer} />
              </box>
            ) : null}
          </box>
        )}
      </box>

      <AppFooter
        isNewSession={isNewSession}
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

      <Toast />
    </box>
  );
}
