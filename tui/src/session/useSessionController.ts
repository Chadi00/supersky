import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useId, useReducer } from "react";

import { destroyRendererAndExit } from "../shared/lifecycle";
import { formatMessageTimestamp } from "../shared/time";
import {
  isExitCommand,
  isExitShortcut,
  isNewSessionShortcut,
} from "./commands";
import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState } from "./types";

export function useSessionController() {
  const renderer = useRenderer();
  const sessionId = useId();
  const [state, dispatch] = useReducer(
    sessionReducer,
    createInitialSessionState(),
  );

  const exitSession = useCallback(() => {
    destroyRendererAndExit(renderer);
  }, [renderer]);

  const resetSession = useCallback(() => {
    dispatch({ type: "sessionReset" });
  }, []);

  const setDraft = useCallback((value: string) => {
    dispatch({ type: "draftChanged", value });
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
      if (!text) {
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
    [exitSession, sessionId],
  );

  const handleKeyboardInput = useCallback(
    (key: { name: string; ctrl: boolean }) => {
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
    setDraft,
    submit,
    showPreviousHistory,
    showNextHistory,
    resetSession,
  };
}
