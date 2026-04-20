import { createInitialSessionState, type SessionState } from "./types";

export type SessionAction =
  | { type: "draftChanged"; value: string }
  | {
      type: "messageSubmitted";
      sessionId: string;
      text: string;
      timestamp: string;
    }
  | { type: "sessionReset" };

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "draftChanged": {
      if (state.draft === action.value) {
        return state;
      }

      return {
        ...state,
        draft: action.value,
      };
    }

    case "messageSubmitted": {
      const nextIndex = state.messages.length;

      return {
        draft: "",
        composerResetToken: state.composerResetToken + 1,
        messages: [
          ...state.messages,
          {
            id: `${action.sessionId}-${nextIndex}`,
            role: "user",
            content: action.text,
            timestamp: action.timestamp,
          },
          {
            id: `${action.sessionId}-${nextIndex + 1}`,
            role: "assistant",
          },
        ],
      };
    }

    case "sessionReset": {
      return {
        ...createInitialSessionState(),
        composerResetToken: state.composerResetToken + 1,
      };
    }
  }
}
