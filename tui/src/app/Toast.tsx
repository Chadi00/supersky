import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { colors } from "../shared/theme";

const splitBorderChars = {
  topLeft: "",
  bottomLeft: "",
  vertical: "┃",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
};

export type ToastVariant = "info" | "success" | "warning" | "error";

export type ToastShowInput = {
  title?: string;
  message: string;
  variant: ToastVariant;
  /** @default 5000 */
  duration?: number;
};

type ToastDisplayState = Omit<ToastShowInput, "duration">;

type ToastContextValue = {
  show: (options: ToastShowInput) => void;
  error: (err: unknown) => void;
};

const ToastActionContext = createContext<ToastContextValue | null>(null);
const ToastViewContext = createContext<ToastDisplayState | null>(null);

const variantBorder: Record<ToastVariant, string> = {
  info: "#ffffff",
  success: colors.successText,
  warning: colors.warningText,
  error: "#f87171",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [currentToast, setCurrentToast] = useState<ToastDisplayState | null>(
    null,
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((options: ToastShowInput) => {
    const { duration = 5000, ...rest } = options;
    setCurrentToast(rest);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setCurrentToast(null);
    }, duration);
    timeoutRef.current.unref?.();
  }, []);

  const error = useCallback(
    (err: unknown) => {
      if (err instanceof Error) {
        show({ variant: "error", message: err.message });
        return;
      }
      show({ variant: "error", message: "An unknown error has occurred" });
    },
    [show],
  );

  const actions = useMemo(() => ({ show, error }), [show, error]);

  return (
    <ToastActionContext.Provider value={actions}>
      <ToastViewContext.Provider value={currentToast}>
        {children}
      </ToastViewContext.Provider>
    </ToastActionContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastActionContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/** OpenCode-style toast overlay (top-right, slim vertical borders). */
export function Toast() {
  const current = useContext(ToastViewContext);
  const { width } = useTerminalDimensions();

  if (!current) {
    return null;
  }

  return (
    <box
      position="absolute"
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      maxWidth={Math.min(60, width - 6)}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={colors.panelBackground}
      borderColor={variantBorder[current.variant]}
      border={["left", "right"]}
      customBorderChars={splitBorderChars}
    >
      {current.title ? (
        <text
          attributes={TextAttributes.BOLD}
          marginBottom={1}
          fg={colors.foregroundText}
        >
          {current.title}
        </text>
      ) : null}
      <text fg={colors.foregroundText} wrapMode="word" width="100%">
        {current.message}
      </text>
    </box>
  );
}
