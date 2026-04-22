import { platform } from "node:os";

/**
 * Writes text to clipboard via OSC 52 (terminal handles copy locally; works over SSH/tmux).
 * Mirrors OpenCode's clipboard helper.
 */
function writeOsc52(text: string): void {
  if (!process.stdout.isTTY) return;
  const base64 = Buffer.from(text).toString("base64");
  const osc52 = `\x1b]52;c;${base64}\x07`;
  const passthrough = process.env.TMUX || process.env.STY;
  const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
  process.stdout.write(sequence);
}

async function spawnStdinCopy(command: string[], text: string): Promise<void> {
  const proc = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  if (!proc.stdin) return;
  proc.stdin.write(text);
  proc.stdin.end();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Clipboard command failed: ${command.join(" ")}`);
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  writeOsc52(text);
  const os = platform();

  if (os === "darwin") {
    await spawnStdinCopy(["pbcopy"], text);
    return;
  }

  if (os === "linux") {
    if (process.env.WAYLAND_DISPLAY && Bun.which("wl-copy")) {
      await spawnStdinCopy(["wl-copy"], text);
      return;
    }
    if (Bun.which("xclip")) {
      await spawnStdinCopy(["xclip", "-selection", "clipboard"], text);
      return;
    }
    if (Bun.which("xsel")) {
      await spawnStdinCopy(["xsel", "--clipboard", "--input"], text);
      return;
    }
    return;
  }

  if (os === "win32") {
    await spawnStdinCopy(
      [
        "powershell.exe",
        "-NonInteractive",
        "-NoProfile",
        "-Command",
        "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
      text,
    );
  }
}
