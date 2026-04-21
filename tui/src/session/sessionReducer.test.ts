import { expect, test } from "bun:test";

import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState, type SessionState } from "./types";

test("adds a user and assistant message when a prompt is submitted", () => {
  const nextState = sessionReducer(
    {
      ...createInitialSessionState(),
      draft: "send on enter",
    },
    {
      type: "messageSubmitted",
      sessionId: "session",
      text: "send on enter",
      timestamp: "3:04:05 PM",
    },
  );

  expect(nextState).toEqual({
    draft: "",
    composerResetToken: 1,
    historyIndex: null,
    historyDraft: null,
    messages: [
      {
        id: "session-0",
        role: "user",
        content: "send on enter",
        timestamp: "3:04:05 PM",
      },
      {
        id: "session-1",
        role: "assistant",
      },
    ],
  });
});

test("resets the session while bumping the composer reset token", () => {
  const nextState = sessionReducer(
    {
      draft: "stale draft",
      composerResetToken: 2,
      historyIndex: 0,
      historyDraft: "work in progress",
      messages: [
        {
          id: "session-0",
          role: "user",
          content: "hello",
          timestamp: "1:00:00 PM",
        },
      ],
    },
    { type: "sessionReset" },
  );

  expect(nextState).toEqual({
    draft: "",
    composerResetToken: 3,
    historyIndex: null,
    historyDraft: null,
    messages: [],
  });
});

test("recalls the newest submitted user message and stashes the current draft", () => {
  const nextState = sessionReducer(
    {
      ...createInitialSessionState(),
      draft: "draft in progress",
      messages: [
        {
          id: "session-0",
          role: "user",
          content: "first prompt",
          timestamp: "1:00:00 PM",
        },
        {
          id: "session-1",
          role: "assistant",
        },
        {
          id: "session-2",
          role: "user",
          content: "second prompt",
          timestamp: "1:01:00 PM",
        },
        {
          id: "session-3",
          role: "assistant",
        },
      ],
    },
    { type: "historyPrevious" },
  );

  expect(nextState.draft).toBe("second prompt");
  expect(nextState.historyIndex).toBe(1);
  expect(nextState.historyDraft).toBe("draft in progress");
});

test("clamps history navigation at the oldest submitted user message", () => {
  const state: SessionState = {
    ...createInitialSessionState(),
    draft: "first prompt",
    historyIndex: 0,
    historyDraft: "draft in progress",
    messages: [
      {
        id: "session-0",
        role: "user",
        content: "first prompt",
        timestamp: "1:00:00 PM",
      },
      {
        id: "session-1",
        role: "assistant",
      },
      {
        id: "session-2",
        role: "user",
        content: "second prompt",
        timestamp: "1:01:00 PM",
      },
      {
        id: "session-3",
        role: "assistant",
      },
    ],
  };

  expect(sessionReducer(state, { type: "historyPrevious" })).toEqual(state);
});

test("moves forward through history before restoring the stashed draft", () => {
  const nextState = sessionReducer(
    {
      ...createInitialSessionState(),
      draft: "first prompt",
      historyIndex: 0,
      historyDraft: "draft in progress",
      messages: [
        {
          id: "session-0",
          role: "user",
          content: "first prompt",
          timestamp: "1:00:00 PM",
        },
        {
          id: "session-1",
          role: "assistant",
        },
        {
          id: "session-2",
          role: "user",
          content: "second prompt",
          timestamp: "1:01:00 PM",
        },
        {
          id: "session-3",
          role: "assistant",
        },
      ],
    },
    { type: "historyNext" },
  );

  expect(nextState.draft).toBe("second prompt");
  expect(nextState.historyIndex).toBe(1);
  expect(nextState.historyDraft).toBe("draft in progress");
});

test("restores the stashed draft after leaving history", () => {
  const nextState = sessionReducer(
    {
      ...createInitialSessionState(),
      draft: "second prompt",
      historyIndex: 1,
      historyDraft: "draft in progress",
      messages: [
        {
          id: "session-0",
          role: "user",
          content: "first prompt",
          timestamp: "1:00:00 PM",
        },
        {
          id: "session-1",
          role: "assistant",
        },
        {
          id: "session-2",
          role: "user",
          content: "second prompt",
          timestamp: "1:01:00 PM",
        },
        {
          id: "session-3",
          role: "assistant",
        },
      ],
    },
    { type: "historyNext" },
  );

  expect(nextState.draft).toBe("draft in progress");
  expect(nextState.historyIndex).toBeNull();
  expect(nextState.historyDraft).toBeNull();
});
