import type { KeyBinding, TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useId, useRef, useState } from "react"

const BG = "#000000"
const PANEL = "#111111"
const COMPOSER_BG = "#141414"
const COMPOSER_MIN_HEIGHT = 3
const COMPOSER_MAX_TEXT_LINES = 4
const COMPOSER_VERTICAL_PADDING = 1
const COMPOSER_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "linefeed", action: "newline" },
]
const ACCENT = "#4a9eff"
const MUTED = "#5a5a5a"
const DIM = "#8a8a8a"
const GREEN = "#4ade80"
const PINK = "#f472b6"
const BLUE = "#7cc6ff"
const AMBER = "#fbbf24"
const WHITE = "#e8e8e8"
const USER_MESSAGE_BG = "#1b1b1b"

const TUI_VERSION = "0.1.0"
const MODEL_NAME = "GPT-5.4 OpenAI"
const MODEL_QUALITY = "high"
const PROJECT_LINE = "~/projects/supersky:main"

type SessionMessage =
  | { id: string; role: "user"; content: string; timestamp: string }
  | { id: string; role: "assistant" }

function formatMessageTimestamp(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
}

type ComposerProps = {
  width: number | `${number}%`
  draft: string
  resetToken: number
  onDraftChange: (value: string) => void
  onSubmit: (value: string) => void
  focused: boolean
  minHeight?: number
  justifyContent?: "center" | "flex-end"
}

function Composer({
  width,
  draft,
  resetToken,
  onDraftChange,
  onSubmit,
  focused,
  minHeight = COMPOSER_MIN_HEIGHT,
  justifyContent = "center",
}: ComposerProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null)

  return (
    <box flexDirection="column" width={width} maxWidth="100%" gap={0}>
      <box flexDirection="row" width="100%" minHeight={minHeight} alignItems="stretch">
        <box
          flexGrow={1}
          flexDirection="column"
          backgroundColor={COMPOSER_BG}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={COMPOSER_VERTICAL_PADDING}
          paddingBottom={COMPOSER_VERTICAL_PADDING}
          minHeight={minHeight}
          justifyContent={justifyContent}
        >
          <textarea
            key={resetToken}
            ref={textareaRef}
            focused={focused}
            placeholderColor="#5a5a5a"
            initialValue={draft}
            minHeight={1}
            maxHeight={COMPOSER_MAX_TEXT_LINES}
            backgroundColor={COMPOSER_BG}
            textColor={WHITE}
            focusedBackgroundColor={COMPOSER_BG}
            focusedTextColor={WHITE}
            wrapMode="word"
            keyBindings={COMPOSER_KEY_BINDINGS}
            onContentChange={() => onDraftChange(textareaRef.current?.plainText ?? "")}
            onSubmit={() => {
              const submitted = textareaRef.current?.plainText ?? draft
              if (!submitted.trim()) {
                return
              }

              textareaRef.current?.clear()
              onDraftChange("")
              onSubmit(submitted)
            }}
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
    </box>
  )
}

export function App() {
  const renderer = useRenderer()
  const { width } = useTerminalDimensions()
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [draft, setDraft] = useState("")
  const [composerResetToken, setComposerResetToken] = useState(0)
  const listId = useId()

  const isNewSession = messages.length === 0
  const compact = width < 56
  const showSidebar = !compact && width >= 72 && !isNewSession
  const sidebarWidth = showSidebar ? Math.min(34, Math.floor(width * 0.26)) : 0

  const composerWelcomeWidth = Math.min(72, Math.max(36, Math.floor(width * 0.48)))

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) {
        return
      }
      const timestamp = formatMessageTimestamp(new Date())

      setMessages((prev) => [
        ...prev,
        { id: `${listId}-${prev.length}`, role: "user", content: text, timestamp },
        { id: `${listId}-${prev.length + 1}`, role: "assistant" },
      ])
      setDraft("")
      setComposerResetToken((value) => value + 1)
    },
    [listId],
  )

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      return
    }

    if (key.ctrl && key.name === "n") {
      setMessages([])
      setDraft("")
      setComposerResetToken((value) => value + 1)
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
              resetToken={composerResetToken}
              onDraftChange={setDraft}
              onSubmit={submit}
              focused
              minHeight={3}
            />
          </box>
        ) : (
          <box flexGrow={1} flexDirection={showSidebar ? "row" : "column"} alignItems="stretch" paddingX={1} gap={1} minHeight={0}>
            <box flexGrow={1} height="100%" flexDirection="column" minHeight={0} minWidth={0} marginTop={showSidebar ? 1 : 0}>
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
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <box key={message.id} flexDirection="column" marginBottom={1}>
                        <box backgroundColor={USER_MESSAGE_BG} paddingX={1} paddingY={1} flexDirection="column" gap={0}>
                          <text fg={WHITE}>{message.content}</text>
                          <text fg={DIM}>{message.timestamp}</text>
                        </box>
                      </box>
                    ) : (
                      <box key={message.id} flexDirection="column" marginBottom={1}>
                        <text fg={GREEN}>Assistant</text>
                        <AssistantDemoOutput />
                      </box>
                    ),
                  )}
                </box>
              </scrollbox>

              <box paddingTop={0} flexShrink={0}>
                <Composer
                  width="100%"
                  draft={draft}
                  resetToken={composerResetToken}
                  onDraftChange={setDraft}
                  onSubmit={submit}
                  focused
                />
              </box>
            </box>

            {showSidebar && (
              <box width={sidebarWidth} height="100%" flexShrink={0} minHeight={0} marginTop={1}>
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
        paddingTop={isNewSession ? 1 : 0}
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
