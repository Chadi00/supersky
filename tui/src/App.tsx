import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useId, useState } from "react"

const BG = "#000000"
const PANEL = "#111111"
const COMPOSER_BG = "#141414"
const COMPOSER_MIN_HEIGHT = 6
const ACCENT = "#4a9eff"
const MUTED = "#5a5a5a"
const DIM = "#8a8a8a"
const GREEN = "#4ade80"
const PINK = "#f472b6"
const BLUE = "#7cc6ff"
const AMBER = "#fbbf24"
const WHITE = "#e8e8e8"

const TUI_VERSION = "0.1.0"
const MODEL_NAME = "GPT-5.4 OpenAI"
const MODEL_QUALITY = "high"
const PROJECT_LINE = "~/projects/supersky:main"

type SessionTurn = { id: string; user: string }

type ComposerProps = {
  width: number | `${number}%`
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: (value: string) => void
  focused: boolean
}

function Composer({ width, draft, onDraftChange, onSubmit, focused }: ComposerProps) {
  return (
    <box flexDirection="column" width={width} maxWidth="100%" gap={0}>
      <box flexDirection="row" width="100%" minHeight={COMPOSER_MIN_HEIGHT} alignItems="stretch">
        <box width={1} backgroundColor={ACCENT} flexShrink={0} />
        <box
          flexGrow={1}
          flexDirection="column"
          backgroundColor={COMPOSER_BG}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          minHeight={COMPOSER_MIN_HEIGHT}
          justifyContent="center"
        >
          <input
            focused={focused}
            placeholder="Ask anything... 'Fix a TODO in the codebase'"
            placeholderColor="#5a5a5a"
            value={draft}
            backgroundColor={COMPOSER_BG}
            textColor={WHITE}
            focusedBackgroundColor={COMPOSER_BG}
            focusedTextColor={WHITE}
            onChange={onDraftChange}
            onSubmit={(value) => onSubmit(typeof value === "string" ? value : draft)}
          />
        </box>
      </box>
    </box>
  )
}

function AssistantDemoOutput() {
  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      <text>
        <span fg={GREEN}>==== OpenTUI Task Complete ====</span>
      </text>
      <text fg={DIM}> </text>
      <text fg={WHITE}>
        <span fg={BLUE}>Framework:</span> react
      </text>
      <text fg={WHITE}>
        <span fg={BLUE}>What I changed:</span> Rebuilt the shell layout to match the reference TUI.
      </text>
      <text fg={WHITE}>
        <span fg={BLUE}>Main files:</span> <span fg={GREEN}>tui/src/App.tsx</span>
      </text>
      <text fg={WHITE}>
        <span fg={BLUE}>Verification:</span> <span fg={PINK}>cd tui</span> then <span fg={PINK}>bun run dev</span>
      </text>
    </box>
  )
}

function Sidebar({ showModified }: { showModified: boolean }) {
  return (
    <box
      width="100%"
      flexGrow={1}
      flexDirection="column"
      backgroundColor={PANEL}
      padding={1}
      gap={1}
      minWidth={26}
    >
      <text fg={WHITE}>
        <strong>Minimalist fullscreen TUI for supersky</strong>
      </text>
      <box flexDirection="column" gap={0}>
        <text fg={DIM}>57,829 tokens</text>
        <text fg={DIM}>6% used</text>
        <text fg={DIM}>$0.00 spent</text>
      </box>
      <text fg={MUTED}>LSP</text>
      <text fg="#6a6a6a">idle</text>
      {showModified && (
        <box flexDirection="column" gap={0}>
          <text fg={DIM}>
            Modified files <span fg={DIM}>▼</span>
          </text>
          <text>
            <span fg={GREEN}>+234</span>
            <span fg={DIM}> tui/src/App.tsx</span>
          </text>
          <text>
            <span fg={GREEN}>+12</span>
            <span fg={DIM}> tui/src/App.test.tsx</span>
          </text>
        </box>
      )}
      <box flexGrow={1} />
      <box flexDirection="column" gap={0}>
        <text fg={MUTED}>{PROJECT_LINE}</text>
        <text fg={MUTED}>supersky tui {TUI_VERSION}</text>
      </box>
    </box>
  )
}

export function App() {
  const renderer = useRenderer()
  const { width } = useTerminalDimensions()
  const [turns, setTurns] = useState<SessionTurn[]>([])
  const [draft, setDraft] = useState("")
  const listId = useId()

  const isNewSession = turns.length === 0
  const compact = width < 56
  const showSidebar = !compact && width >= 72 && !isNewSession

  const composerWelcomeWidth = Math.min(88, Math.max(44, Math.floor(width * 0.58)))

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) {
        return
      }
      setTurns((prev) => [...prev, { id: `${listId}-${prev.length}`, user: text }])
      setDraft("")
    },
    [listId],
  )

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      return
    }

    if (key.ctrl && key.name === "n") {
      setTurns([])
      setDraft("")
    }
  })

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={BG}>
      <box flexGrow={1} flexDirection="column" minHeight={0}>
        {isNewSession ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" paddingBottom={2}>
            <box flexDirection="column" alignItems="center" gap={0} marginBottom={1}>
              <box height={7} justifyContent="center" alignItems="center">
                <box flexDirection="column" alignItems="center" gap={0}>
                  <text fg="#d0d0d0"> ___ _   _ _ __   ___ _ __ ___| | ___   _</text>
                  <text fg="#d0d0d0">/ __| | | | '_ \ / _ \ '__/ __| |/ / | | |</text>
                  <text fg="#d0d0d0">\__ \ |_| | |_) |  __/ |  \__ \   &lt;| |_| |</text>
                  <text fg="#d0d0d0">|___/\__,_| .__/ \___|_|  |___/_|\_\\__, |</text>
                  <text fg="#d0d0d0">          |_|                       |___/ </text>
                </box>
              </box>
            </box>

            <Composer
              width={composerWelcomeWidth}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={submit}
              focused
            />
          </box>
        ) : (
          <box flexGrow={1} flexDirection={showSidebar ? "row" : "column"} paddingX={1} gap={1} minHeight={0}>
            <box flexGrow={1} flexDirection="column" minHeight={0} minWidth={0}>
              <scrollbox
                flexGrow={1}
                focused={false}
                stickyScroll
                stickyStart="bottom"
                style={{
                  rootOptions: { flexGrow: 1, minHeight: 0 },
                  wrapperOptions: { backgroundColor: BG },
                  viewportOptions: { backgroundColor: BG },
                  contentOptions: { backgroundColor: BG },
                  scrollbarOptions: {
                    trackOptions: { foregroundColor: ACCENT, backgroundColor: "#1a1a1a" },
                  },
                }}
              >
                <box flexDirection="column" padding={1} gap={0}>
                  {turns.map((t) => (
                    <box key={t.id} flexDirection="column" marginBottom={1}>
                      <text fg={BLUE}>You</text>
                      <text fg={WHITE}>{t.user}</text>
                      <box marginTop={1}>
                        <AssistantDemoOutput />
                      </box>
                    </box>
                  ))}
                </box>
              </scrollbox>

              <box paddingTop={1} flexShrink={0}>
                <Composer
                  width="100%"
                  draft={draft}
                  onDraftChange={setDraft}
                  onSubmit={submit}
                  focused
                />
              </box>
            </box>

            {showSidebar && (
              <box width={Math.min(34, Math.floor(width * 0.26))} flexShrink={0} minHeight={0}>
                <Sidebar showModified />
              </box>
            )}
          </box>
        )}
      </box>

      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingX={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={MUTED}>{PROJECT_LINE}</text>
        <text>
          <span fg={MUTED}>{MODEL_NAME}</span>
          <span fg={MUTED}> · </span>
          <span fg={AMBER}>{MODEL_QUALITY}</span>
          <span fg={MUTED}> · </span>
          <span fg={MUTED}>{TUI_VERSION}</span>
        </text>
      </box>
    </box>
  )
}
