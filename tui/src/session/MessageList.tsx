import type { ScrollBoxRenderable } from "@opentui/core";
import { useCallback } from "react";

import { colors } from "../shared/theme";
import { AssistantMessage } from "./AssistantMessage";
import type { SessionMessage } from "./types";

type MessageListProps = {
  messages: SessionMessage[];
  onMouseDown?: () => void;
};

export function MessageList({ messages, onMouseDown }: MessageListProps) {
  const setMessagesScrollRef = useCallback(
    (node: ScrollBoxRenderable | null) => {
      if (!node) {
        return;
      }

      node.verticalScrollBar.visible = false;
      node.horizontalScrollBar.visible = false;
    },
    [],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Message list clicks refocus the composer textarea.
    <scrollbox
      ref={setMessagesScrollRef}
      flexGrow={1}
      focused={false}
      focusable={false}
      stickyScroll
      stickyStart="bottom"
      style={{
        rootOptions: { flexGrow: 1, minHeight: 0 },
        wrapperOptions: { backgroundColor: colors.background },
        viewportOptions: { backgroundColor: colors.background },
        contentOptions: { backgroundColor: colors.background },
        scrollbarOptions: { visible: false },
        verticalScrollbarOptions: { visible: false },
        horizontalScrollbarOptions: { visible: false },
      }}
      onMouseDown={() => {
        onMouseDown?.();
      }}
    >
      <box flexDirection="column" padding={1} gap={0}>
        {messages.map((message) =>
          message.role === "user" ? (
            <box key={message.id} flexDirection="column" marginBottom={1}>
              <box
                backgroundColor={colors.userMessageBackground}
                paddingX={1}
                paddingY={1}
                flexDirection="column"
                gap={0}
              >
                <text fg={colors.foregroundText}>{message.content}</text>
                <text fg={colors.dimText}>{message.timestamp}</text>
              </box>
            </box>
          ) : (
            <AssistantMessage key={message.id} />
          ),
        )}
      </box>
    </scrollbox>
  );
}
