import { expect, test } from "bun:test";

import {
  COMPACT_LAYOUT_WIDTH,
  deriveSessionLayout,
  SIDEBAR_LAYOUT_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./layout";

test("keeps new sessions in the welcome layout at any width", () => {
  expect(deriveSessionLayout(SIDEBAR_LAYOUT_WIDTH, true).showSidebar).toBe(
    false,
  );
});

test("shows the sidebar only once both panels fit", () => {
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

test("never renders a visible sidebar narrower than its minimum width", () => {
  const layout = deriveSessionLayout(SIDEBAR_LAYOUT_WIDTH, false);

  expect(layout.showSidebar).toBe(true);
  expect(layout.sidebarWidth).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
});

test("clamps the welcome composer width for very small and very large terminals", () => {
  expect(deriveSessionLayout(20, true).welcomeComposerWidth).toBe(36);
  expect(deriveSessionLayout(200, true).welcomeComposerWidth).toBe(72);
});
