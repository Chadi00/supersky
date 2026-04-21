# Supersky TUI

Minimal fullscreen OpenTUI shell for the `supersky` project.

## Commands

```bash
bun install
bun run dev
bun run format
bun run lint
bun run test
bun run typecheck
bun run check
```

## Controls

```text
Enter                     Submit the current prompt
Shift+Enter / Linefeed    Insert a newline in the composer
Up / Down                 Move lines first, then recall at top/bottom start/end
Ctrl+C                    Exit cleanly
Ctrl+N                    Reset back to a new session
exit + Enter              Exit cleanly from the composer
```

`Esc` is still wired as an exit shortcut in the runtime app, but the current OpenTUI test renderer does not emit an escape event, so that path is not part of the automated suite.

## Architecture

```text
src/
  App.tsx                 Thin composition root
  app/                    App chrome and static shell config
  session/                Session reducer, controller, layout, and UI pieces
  shared/                 Cross-cutting helpers (theme, time, lifecycle)
  test/                   Reusable TUI test helpers
```

## Test Coverage

The suite covers the current visible behavior and the pure helper modules:

- initial shell render
- prompt submission
- `exit` command handling
- multiline drafting and submission layout
- composer history recall with `Up` / `Down`
- `Ctrl+C` exit and `Ctrl+N` reset
- wide vs narrow sidebar behavior
- hidden scrollbars and footer anchoring under overflow
- command parsing, reducer transitions, layout breakpoints, and timestamp formatting

Built with Bun and the OpenTUI React reconciler.
