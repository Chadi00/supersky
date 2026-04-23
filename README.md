# Supersky

**Supersky** is a small coding-agent harness (short system prompt, four tools: `read`, `edit`, `write`, `bash`) plus a fullscreen terminal UI on [OpenTUI](https://opentui.com) — the same TUI stack OpenCode uses. It takes cues from [pi.dev](https://pi.dev): a tight agent core, with sessions, slash commands, and keyboard shortcuts in the shell around it.

---

## Run it

From the `tui` package:

```bash
cd tui
bun install
chmod +x bin/supersky
bun link
```

Run **`supersky`** from any project directory to open the UI with that folder as the working tree.

Development:

```bash
bun run dev      # dev entry
bun run test     # tests
bun run check    # lint + typecheck + test
```

---

## Using the UI

Run **`/hotkey`** in the composer to see keyboard shortcuts. Type **`exit`** and press Enter to quit.

---

## Slash commands

Prefix with `/` in the composer (or pick from the menu):

| Command | What it does |
|---------|----------------|
| `/login` | Connect a provider |
| `/logout` | Disconnect a provider |
| `/model` | Change model |
| `/sessions` | List and switch sessions |
| `/rename` | Rename current session |
| `/settings` | Configure Supersky |
| `/new` | Start a new session |
| `/fork` | Fork from the last user message |
| `/export` | Export session transcript |
| `/copy` | Copy the last assistant message |
| `/hotkey` | Show hotkeys |
| `/variants` | Change thinking level |
| `/compact` | Compact the active session |
| `/editor` | Open the project in your editor |
| `/exit` | Quit |

More detail for contributors: [`tui/README.md`](tui/README.md).
