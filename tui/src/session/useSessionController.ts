import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useId, useReducer } from "react";

import { destroyRenderer } from "../shared/lifecycle";
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
    destroyRenderer(renderer);
  }, [renderer]);

  const resetSession = useCallback(() => {
    dispatch({ type: "sessionReset" });
  }, []);

  const setDraft = useCallback((value: string) => {
    dispatch({ type: "draftChanged", value });
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

  return {
    state,
    isNewSession: state.messages.length === 0,
    setDraft,
    submit,
    resetSession,
  };
}
