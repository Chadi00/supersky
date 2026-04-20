import { expect, test } from "bun:test";

import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState } from "./types";

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
    messages: [],
  });
});
