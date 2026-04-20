import { expect, test } from "bun:test";

import {
  COMPACT_LAYOUT_WIDTH,
  deriveSessionLayout,
  SIDEBAR_LAYOUT_WIDTH,
} from "./layout";

test("keeps new sessions in the welcome layout at any width", () => {
  expect(deriveSessionLayout(SIDEBAR_LAYOUT_WIDTH, true).showSidebar).toBe(
    false,
  );
});

test("shows the sidebar only once the wide-session breakpoint is reached", () => {
  expect(deriveSessionLayout(COMPACT_LAYOUT_WIDTH - 1, false).showSidebar).toBe(
    false,
  );
  expect(deriveSessionLayout(SIDEBAR_LAYOUT_WIDTH - 1, false).showSidebar).toBe(
    false,
  );
  expect(deriveSessionLayout(SIDEBAR_LAYOUT_WIDTH, false).showSidebar).toBe(
    true,
  );
});

test("clamps the welcome composer width for very small and very large terminals", () => {
  expect(deriveSessionLayout(20, true).welcomeComposerWidth).toBe(36);
  expect(deriveSessionLayout(200, true).welcomeComposerWidth).toBe(72);
});
