import { expect, test } from "bun:test";

import { formatMessageTimestamp } from "./time";

test("formats timestamps in en-US 12-hour time with seconds", () => {
  expect(formatMessageTimestamp(new Date(2024, 0, 1, 15, 4, 5))).toBe(
    "3:04:05 PM",
  );
});
