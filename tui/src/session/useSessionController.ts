import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useId, useReducer, useRef, useState } from "react";

import { destroyRendererAndExit } from "../shared/lifecycle";
import { formatMessageTimestamp } from "../shared/time";
import type { CommandPickerState } from "./commandPicker";
import {
  EXIT_COMMAND,
  isExitCommand,
  isExitShortcut,
  isNewSessionShortcut,
  MODEL_COMMAND,
  NEW_SESSION_COMMAND,
  PROVIDER_COMMAND,
  parseSubmittedSlashCommand,
  SETTINGS_COMMAND,
} from "./commands";
import {
  findExactProviderModelMatch,
  findProviderModel,
  findProviderOption,
  getDefaultProviderModel,
  getMatchingProviderModels,
  getProviderOptions,
  type ProviderId,
} from "./providerCatalog";
import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState } from "./types";

type ActivePickerState =
  | { kind: "provider" }
  | { kind: "model"; query: string };

function getResolvedProviderModelId(
  providerId: ProviderId,
  selectedModelByProvider: Partial<Record<ProviderId, string>>,
) {
  const selectedModelId = selectedModelByProvider[providerId];
  if (selectedModelId && findProviderModel(providerId, selectedModelId)) {
    return selectedModelId;
  }

  return getDefaultProviderModel(providerId)?.id ?? null;
}

export function useSessionController() {
  const renderer = useRenderer();
  const sessionId = useId();
  const composerMenuOpenRef = useRef(false);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [dismissComposerMenuToken, setDismissComposerMenuToken] = useState(0);
  const [activePicker, setActivePicker] = useState<ActivePickerState | null>(
    null,
  );
  const [connectedProviderIds, setConnectedProviderIds] = useState<
    ProviderId[]
  >([]);
  const [activeProviderId, setActiveProviderId] = useState<ProviderId | null>(
    null,
  );
  const [selectedModelByProvider, setSelectedModelByProvider] = useState<
    Partial<Record<ProviderId, string>>
  >({});
  const [state, dispatch] = useReducer(
    sessionReducer,
    createInitialSessionState(),
  );

  const activePickerRef = useRef<ActivePickerState | null>(null);
  const connectedProviderIdsRef = useRef<ProviderId[]>([]);
  const activeProviderIdRef = useRef<ProviderId | null>(null);
  const selectedModelByProviderRef = useRef<
    Partial<Record<ProviderId, string>>
  >({});

  activePickerRef.current = activePicker;
  connectedProviderIdsRef.current = connectedProviderIds;
  activeProviderIdRef.current = activeProviderId;
  selectedModelByProviderRef.current = selectedModelByProvider;

  const activeProvider = activeProviderId
    ? findProviderOption(activeProviderId)
    : null;
  const activeModelId = activeProviderId
    ? getResolvedProviderModelId(activeProviderId, selectedModelByProvider)
    : null;
  const activeModel =
    activeProviderId && activeModelId
      ? findProviderModel(activeProviderId, activeModelId)
      : null;

  const closeActivePicker = useCallback(() => {
    setActivePicker(null);
  }, []);

  const selectProvider = useCallback((providerId: ProviderId) => {
    const provider = findProviderOption(providerId);
    if (!provider) {
      return;
    }

    const resolvedModelId = getResolvedProviderModelId(
      providerId,
      selectedModelByProviderRef.current,
    );

    setConnectedProviderIds((currentProviders) =>
      currentProviders.includes(providerId)
        ? currentProviders
        : [...currentProviders, providerId],
    );
    setActiveProviderId(providerId);
    setSelectedModelByProvider((currentSelections) => {
      if (
        resolvedModelId === null ||
        currentSelections[providerId] === resolvedModelId
      ) {
        return currentSelections;
      }

      return {
        ...currentSelections,
        [providerId]: resolvedModelId,
      };
    });
    setActivePicker(null);
  }, []);

  const selectModel = useCallback((modelId: string) => {
    const providerId = activeProviderIdRef.current;
    if (!providerId) {
      return;
    }

    const provider = findProviderOption(providerId);
    const model = findProviderModel(providerId, modelId);
    if (!provider || !model) {
      return;
    }

    setSelectedModelByProvider((currentSelections) => ({
      ...currentSelections,
      [providerId]: model.id,
    }));
    setActivePicker(null);
  }, []);

  const openProviderPicker = useCallback(() => {
    setCommandNotice(null);
    setActivePicker({ kind: "provider" });
  }, []);

  const openModelPicker = useCallback((query = "") => {
    setCommandNotice(null);
    setActivePicker({ kind: "model", query });
  }, []);

  const exitSession = useCallback(() => {
    setCommandNotice(null);
    destroyRendererAndExit(renderer);
  }, [renderer]);

  const resetSession = useCallback(() => {
    setCommandNotice(null);
    setActivePicker(null);
    dispatch({ type: "sessionReset" });
  }, []);

  const setDraft = useCallback((value: string) => {
    if (value) {
      setCommandNotice(null);
    }

    dispatch({ type: "draftChanged", value });
  }, []);

  const setComposerMenuOpen = useCallback((open: boolean) => {
    composerMenuOpenRef.current = open;
  }, []);

  const showPreviousHistory = useCallback(() => {
    dispatch({ type: "historyPrevious" });
  }, []);

  const showNextHistory = useCallback(() => {
    dispatch({ type: "historyNext" });
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      setCommandNotice(null);

      if (!text) {
        return;
      }

      const slashCommand = parseSubmittedSlashCommand(text);
      if (slashCommand) {
        if (slashCommand.command.name === NEW_SESSION_COMMAND) {
          resetSession();
          return;
        }

        if (slashCommand.command.name === EXIT_COMMAND) {
          exitSession();
          return;
        }

        if (slashCommand.command.name === PROVIDER_COMMAND) {
          openProviderPicker();
          return;
        }

        if (slashCommand.command.name === MODEL_COMMAND) {
          const currentProviderId = activeProviderIdRef.current;
          if (!currentProviderId) {
            openModelPicker(slashCommand.argumentText);
            return;
          }

          const exactModelMatch = findExactProviderModelMatch(
            currentProviderId,
            slashCommand.argumentText,
          );
          if (exactModelMatch) {
            selectModel(exactModelMatch.id);
            return;
          }

          openModelPicker(slashCommand.argumentText);
          return;
        }

        if (slashCommand.command.name === SETTINGS_COMMAND) {
          setCommandNotice("Settings screen not implemented yet.");
          return;
        }
      }

      const unknownSlashCommand = text.match(/^\/([^\s]+)/)?.[0];
      if (unknownSlashCommand) {
        setCommandNotice(`Unknown command: ${unknownSlashCommand}`);
        return;
      }

      if (isExitCommand(text)) {
        exitSession();
        return;
      }

      dispatch({
        type: "messageSubmitted",
        sessionId,
        text,
        timestamp: formatMessageTimestamp(new Date()),
      });
    },
    [
      exitSession,
      openModelPicker,
      openProviderPicker,
      resetSession,
      selectModel,
      sessionId,
    ],
  );

  const handleKeyboardInput = useCallback(
    (key: { name: string; ctrl: boolean; defaultPrevented?: boolean }) => {
      if (key.name === "escape") {
        if (activePickerRef.current) {
          setActivePicker(null);
          setDismissComposerMenuToken((currentToken) => currentToken + 1);
          return;
        }

        if (composerMenuOpenRef.current) {
          setDismissComposerMenuToken((currentToken) => currentToken + 1);
          return;
        }
      }

      if (key.defaultPrevented) {
        return;
      }

      if (isExitShortcut(key)) {
        exitSession();
        return;
      }

      if (isNewSessionShortcut(key)) {
        resetSession();
      }
    },
    [exitSession, resetSession],
  );

  useKeyboard(handleKeyboardInput);

  const hasSubmittedUserMessages = state.messages.some(
    (message) => message.role === "user",
  );

  const commandPickerState: CommandPickerState | null = (() => {
    if (!activePicker) {
      return null;
    }

    if (activePicker.kind === "provider") {
      return {
        kind: "provider",
        title: "Select provider to connect",
        helperText: "Press Enter to connect or switch providers.",
        emptyText: "No providers available.",
        selectedItemId: activeProviderId,
        items: getProviderOptions().map((provider) => {
          const isCurrent = provider.id === activeProviderId;
          const isConnected = connectedProviderIds.includes(provider.id);

          let meta: string | undefined;
          if (isCurrent) {
            meta = "Current";
          } else if (isConnected) {
            meta = "Connected";
          }

          return {
            id: provider.id,
            label: provider.name,
            meta,
          };
        }),
      };
    }

    if (!activeProviderId || !activeProvider) {
      return {
        kind: "model",
        title: "Select model",
        helperText: activePicker.query
          ? `Filter: ${activePicker.query}`
          : undefined,
        filterText: activePicker.query || undefined,
        emptyText: "Connect a provider with /provider first.",
        items: [],
      };
    }

    const matchingModels = getMatchingProviderModels(
      activeProviderId,
      activePicker.query,
    );

    return {
      kind: "model",
      title: `Select model for ${activeProvider.name}`,
      helperText: activePicker.query
        ? `Showing matches for ${activePicker.query}`
        : `Connected provider: ${activeProvider.name}`,
      filterText: activePicker.query || undefined,
      emptyText:
        activePicker.query.length > 0
          ? `No models match ${activePicker.query}.`
          : `No models available for ${activeProvider.name}.`,
      selectedItemId: activeModel?.id ?? null,
      items: matchingModels.map((model) => ({
        id: model.id,
        label: model.name,
      })),
    };
  })();

  const selectCommandPickerItem = useCallback(
    (itemId: string) => {
      if (!activePicker) {
        return;
      }

      if (activePicker.kind === "provider") {
        const provider = findProviderOption(itemId);
        if (provider) {
          selectProvider(provider.id);
        }
        return;
      }

      selectModel(itemId);
    },
    [activePicker, selectModel, selectProvider],
  );

  return {
    state,
    isNewSession: state.messages.length === 0,
    hasSubmittedUserMessages,
    isBrowsingHistory: state.historyIndex !== null,
    commandNotice,
    dismissComposerMenuToken,
    setComposerMenuOpen,
    setDraft,
    submit,
    showPreviousHistory,
    showNextHistory,
    resetSession,
    activeProvider,
    activeModel,
    commandPickerState,
    closeCommandPicker: closeActivePicker,
    selectCommandPickerItem,
  };
}
