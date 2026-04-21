export const COMPACT_LAYOUT_WIDTH = 56;
export const SIDEBAR_MIN_WIDTH = 26;
const SESSION_LAYOUT_HORIZONTAL_PADDING = 2;
const SESSION_LAYOUT_PANEL_GAP = 1;
export const SIDEBAR_LAYOUT_WIDTH =
  COMPACT_LAYOUT_WIDTH +
  SIDEBAR_MIN_WIDTH +
  SESSION_LAYOUT_HORIZONTAL_PADDING +
  SESSION_LAYOUT_PANEL_GAP;
const SIDEBAR_MAX_WIDTH = 34;
const SIDEBAR_WIDTH_RATIO = 0.26;
const WELCOME_COMPOSER_MIN_WIDTH = 36;
const WELCOME_COMPOSER_MAX_WIDTH = 72;

export type SessionLayout = {
  isCompact: boolean;
  showSidebar: boolean;
  sidebarWidth: number;
  welcomeComposerWidth: number;
};

export function deriveSessionLayout(
  width: number,
  isNewSession: boolean,
): SessionLayout {
  const isCompact = width < COMPACT_LAYOUT_WIDTH;
  const showSidebar =
    !isCompact && width >= SIDEBAR_LAYOUT_WIDTH && !isNewSession;

  return {
    isCompact,
    showSidebar,
    sidebarWidth: showSidebar
      ? Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, Math.floor(width * SIDEBAR_WIDTH_RATIO)),
        )
      : 0,
    welcomeComposerWidth: Math.min(
      WELCOME_COMPOSER_MAX_WIDTH,
      Math.max(WELCOME_COMPOSER_MIN_WIDTH, Math.floor(width * 0.48)),
    ),
  };
}
