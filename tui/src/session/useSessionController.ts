import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useId, useReducer, useRef, useState } from "react";

import { destroyRendererAndExit } from "../shared/lifecycle";
import { formatMessageTimestamp } from "../shared/time";
import {
  EXIT_COMMAND,
  isExitCommand,
  isExitShortcut,
  isNewSessionShortcut,
  NEW_SESSION_COMMAND,
  parseSubmittedSlashCommand,
} from "./commands";
import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState } from "./types";

export function useSessionController() {
  const renderer = useRenderer();
  const sessionId = useId();
  const slashMenuOpenRef = useRef(false);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [dismissSlashMenuToken, setDismissSlashMenuToken] = useState(0);
  const [state, dispatch] = useReducer(
    sessionReducer,
    createInitialSessionState(),
  );

  const exitSession = useCallback(() => {
    setCommandNotice(null);
    destroyRendererAndExit(renderer);
  }, [renderer]);

  const resetSession = useCallback(() => {
    setCommandNotice(null);
    dispatch({ type: "sessionReset" });
  }, []);

  const setDraft = useCallback((value: string) => {
    if (value) {
      setCommandNotice(null);
    }

    dispatch({ type: "draftChanged", value });
  }, []);

  const setSlashMenuOpen = useCallback((open: boolean) => {
    slashMenuOpenRef.current = open;
  }, []);

  const showPreviousHistory = useCallback(() => {
    dispatch({ type: "historyPrevious" });
  }, []);

  const showNextHistory = useCallback(() => {
    dispatch({ type: "historyNext" });
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      setCommandNotice(null);

      if (!text) {
        return;
      }

      const slashCommand = parseSubmittedSlashCommand(text);
      if (slashCommand) {
        if (slashCommand.name === NEW_SESSION_COMMAND) {
          resetSession();
          return;
        }

        if (slashCommand.name === EXIT_COMMAND) {
          exitSession();
          return;
        }

        setCommandNotice(slashCommand.stubMessage ?? null);
        return;
      }

      const unknownSlashCommand = text.match(/^\/([^\s]+)/)?.[0];
      if (unknownSlashCommand) {
        setCommandNotice(`Unknown command: ${unknownSlashCommand}`);
        return;
      }

      if (isExitCommand(text)) {
        exitSession();
        return;
      }

      dispatch({
        type: "messageSubmitted",
        sessionId,
        text,
        timestamp: formatMessageTimestamp(new Date()),
      });
    },
    [exitSession, resetSession, sessionId],
  );

  const handleKeyboardInput = useCallback(
    (key: { name: string; ctrl: boolean; defaultPrevented?: boolean }) => {
      if (key.name === "escape") {
        if (slashMenuOpenRef.current) {
          setDismissSlashMenuToken((currentToken) => currentToken + 1);
          return;
        }
      }

      if (key.defaultPrevented) {
        return;
      }

      if (isExitShortcut(key)) {
        exitSession();
        return;
      }

      if (isNewSessionShortcut(key)) {
        resetSession();
      }
    },
    [exitSession, resetSession],
  );

  useKeyboard(handleKeyboardInput);

  const hasSubmittedUserMessages = state.messages.some(
    (message) => message.role === "user",
  );

  return {
    state,
    isNewSession: state.messages.length === 0,
    hasSubmittedUserMessages,
    isBrowsingHistory: state.historyIndex !== null,
    commandNotice,
    dismissSlashMenuToken,
    setSlashMenuOpen,
    setDraft,
    submit,
    showPreviousHistory,
    showNextHistory,
    resetSession,
  };
}
