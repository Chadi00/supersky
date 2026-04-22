import { useTerminalDimensions } from "@opentui/react";

import { AppFooter } from "./app/AppFooter";
import { Composer } from "./session/Composer";
import { deriveSessionLayout } from "./session/layout";
import { MessageList } from "./session/MessageList";
import { SessionSidebar } from "./session/SessionSidebar";
import { useSessionController } from "./session/useSessionController";
import { WelcomeScreen } from "./session/WelcomeScreen";
import { colors } from "./shared/theme";

type AppProps = {
  projectLine: string;
};

export function App({ projectLine }: AppProps) {
  const { width } = useTerminalDimensions();
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
    activeProvider,
    activeModel,
    commandPickerState,
    closeCommandPicker,
    selectCommandPickerItem,
  } = useSessionController();
  const layout = deriveSessionLayout(width, isNewSession);

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={colors.background}
    >
      <box flexGrow={1} flexDirection="column" minHeight={0}>
        {isNewSession ? (
          <WelcomeScreen
            composerWidth={layout.welcomeComposerWidth}
            draft={state.draft}
            commandNotice={commandNotice}
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
            <box flexGrow={1} flexDirection="column" minHeight={0} minWidth={0}>
              <MessageList messages={state.messages} />

              <box paddingTop={0} flexShrink={0}>
                <Composer
                  width="100%"
                  draft={state.draft}
                  commandNotice={null}
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
                  focused
                />
              </box>
            </box>

            {layout.showSidebar ? (
              <box width={layout.sidebarWidth} flexShrink={0} minHeight={0}>
                <SessionSidebar />
              </box>
            ) : null}
          </box>
        )}
      </box>

      <AppFooter
        isNewSession={isNewSession}
        projectLine={projectLine}
        providerName={activeProvider?.name ?? null}
        modelName={activeModel?.name ?? null}
      />
    </box>
  );
}
