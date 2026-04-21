export type UserSessionMessage = {
  id: string;
  role: "user";
  content: string;
  timestamp: string;
};

export type AssistantSessionMessage = {
  id: string;
  role: "assistant";
};

export type SessionMessage = UserSessionMessage | AssistantSessionMessage;

export type SessionState = {
  draft: string;
  messages: SessionMessage[];
  composerResetToken: number;
  historyIndex: number | null;
  historyDraft: string | null;
};

export function createInitialSessionState(): SessionState {
  return {
    draft: "",
    messages: [],
    composerResetToken: 0,
    historyIndex: null,
    historyDraft: null,
  };
}
