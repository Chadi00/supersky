import { sidebarData } from "../app/config";
import { colors } from "../shared/theme";

type SessionSidebarProps = {
  showModified?: boolean;
};

export function SessionSidebar({ showModified = true }: SessionSidebarProps) {
  return (
    <box
      width="100%"
      flexGrow={1}
      flexDirection="column"
      backgroundColor={colors.panelBackground}
      padding={1}
      gap={1}
      minWidth={26}
    >
      <text fg={colors.foregroundText}>
        <strong>{sidebarData.title}</strong>
      </text>
      <box flexDirection="column" gap={0}>
        {sidebarData.usage.map((entry) => (
          <text key={entry} fg={colors.dimText}>
            {entry}
          </text>
        ))}
      </box>
      <text fg={colors.mutedText}>{sidebarData.lspLabel}</text>
      <text fg={colors.sidebarStatusText}>{sidebarData.lspStatus}</text>
      {showModified ? (
        <box flexDirection="column" gap={0}>
          <text fg={colors.dimText}>
            Modified files <span fg={colors.dimText}>▼</span>
          </text>
          {sidebarData.modifiedFiles.map((file) => (
            <text key={file.path}>
              <span fg={colors.successText}>{file.delta}</span>
              <span fg={colors.dimText}> {file.path}</span>
            </text>
          ))}
        </box>
      ) : null}
      <box flexGrow={1} />
    </box>
  );
}
