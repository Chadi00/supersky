# Supersky TUI

Fullscreen [OpenTUI](https://opentui.com) shell for the Supersky agent. Built with [Bun](https://bun.sh) and the OpenTUI React reconciler.

## Setup

```bash
bun install
chmod +x bin/supersky
bun link
```

After `bun link`, run `supersky` from any project directory; that directory becomes the agent working tree.

## Scripts

| Script | What it runs |
|--------|----------------|
| `bun run start` | Run `src/index.tsx` once |
| `bun run dev` | Watch mode (`bun run --watch src/index.tsx`) |
| `bun run build` | Bundle to `dist/` (Bun target) |
| `bun run test` | Test suite |
| `bun run lint` | Biome check |
| `bun run format` | Biome check with write |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check` | `lint` → `typecheck` → `test` |

## Keyboard shortcuts

Composer and global shortcuts (use **`/hotkey`** in the app for the live list):

| Shortcut | Action |
|----------|--------|
| **Enter** | Send the current prompt |
| **Shift+Enter** / linefeed | New line in the composer |
| **Up** / **Down** | Move lines, then browse composer history at top/bottom |
| **/** | Open slash commands |
| **!** | Run a shell command (with context) |
| **!!** | Run a shell command without context |
| **Esc** | Close dialog or cancel shell / streaming |
| **Ctrl+N** | New session |
| **Ctrl+C** | Quit |
| **Ctrl+D** / **Ctrl+R** / **Ctrl+K** | In `/sessions`: delete, rename, or copy session id |
| `exit` + **Enter** | Quit from the composer |

`Esc` is also wired in the app; the OpenTUI test renderer may not emit escape events, so that path is not fully covered in automated tests.

## Layout

```text
src/
  App.tsx                 Composition root
  app/                    Chrome, config, hotkeys, launch
  session/                Session state, UI, commands, provider wiring
  agent/                  Tools, runtime, system prompt
  shared/                 Theme, time, lifecycle helpers
  test/                   TUI test utilities
  vendor/                 Vendored agent / provider code
```

## Tests

The suite covers visible TUI behavior and pure helpers, including: initial render, prompt submission, `exit`, multiline compose/recall, history, **Ctrl+C** / **Ctrl+N**, sidebar width, scroll/overflow, command parsing, reducer transitions, and timestamp formatting.
