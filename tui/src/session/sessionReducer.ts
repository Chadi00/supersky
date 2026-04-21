import {
  createInitialSessionState,
  type SessionState,
  type UserSessionMessage,
} from "./types";

export type SessionAction =
  | { type: "draftChanged"; value: string }
  | { type: "historyPrevious" }
  | { type: "historyNext" }
  | {
      type: "messageSubmitted";
      sessionId: string;
      text: string;
      timestamp: string;
    }
  | { type: "sessionReset" };

function getUserMessages(messages: SessionState["messages"]) {
  return messages.filter(
    (message): message is UserSessionMessage => message.role === "user",
  );
}

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

    case "historyPrevious": {
      const userMessages = getUserMessages(state.messages);
      if (userMessages.length === 0) {
        return state;
      }

      const nextHistoryIndex =
        state.historyIndex === null
          ? userMessages.length - 1
          : Math.max(0, state.historyIndex - 1);
      const nextHistoryDraft =
        state.historyIndex === null ? state.draft : state.historyDraft;
      const nextDraft = userMessages[nextHistoryIndex]?.content ?? state.draft;

      if (
        state.historyIndex === nextHistoryIndex &&
        state.historyDraft === nextHistoryDraft &&
        state.draft === nextDraft
      ) {
        return state;
      }

      return {
        ...state,
        draft: nextDraft,
        historyIndex: nextHistoryIndex,
        historyDraft: nextHistoryDraft,
      };
    }

    case "historyNext": {
      if (state.historyIndex === null) {
        return state;
      }

      const userMessages = getUserMessages(state.messages);
      if (userMessages.length === 0) {
        return state;
      }

      if (state.historyIndex >= userMessages.length - 1) {
        return {
          ...state,
          draft: state.historyDraft ?? "",
          historyIndex: null,
          historyDraft: null,
        };
      }

      const nextHistoryIndex = state.historyIndex + 1;

      return {
        ...state,
        draft: userMessages[nextHistoryIndex]?.content ?? state.draft,
        historyIndex: nextHistoryIndex,
      };
    }

    case "messageSubmitted": {
      const nextIndex = state.messages.length;

      return {
        draft: "",
        composerResetToken: state.composerResetToken + 1,
        historyIndex: null,
        historyDraft: null,
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
