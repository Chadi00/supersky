import { useKeyboard, useRenderer } from "@opentui/react";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { BashExecutionMessage } from "../agent/bashExecutionTypes";
import { type AgentRuntimeLike, SuperskyAgentRuntime } from "../agent/runtime";
import { executeUserShellCommand } from "../agent/userShell";
import { copyToClipboard } from "../app/clipboard";
import { destroyRendererAndExit } from "../shared/lifecycle";
import type {
	AgentEvent,
	AgentMessage,
} from "../vendor/pi-agent-core/index.js";
import type { UserMessage } from "../vendor/pi-ai/index.js";
import type { CommandPickerState } from "./commandPicker";
import {
	EXIT_COMMAND,
	FORK_COMMAND,
	isExitCommand,
	isExitShortcut,
	isNewSessionShortcut,
	LOGIN_COMMAND,
	LOGOUT_COMMAND,
	MODEL_COMMAND,
	NEW_SESSION_COMMAND,
	parseSubmittedSlashCommand,
	RENAME_COMMAND,
	SESSIONS_COMMAND,
	SETTINGS_COMMAND,
} from "./commands";
import { buildSessionSidebarUsageLines } from "./contextUsageDisplay";
import type { LoginDialogLineTone, LoginDialogState } from "./LoginDialog";
import { openUrlInBrowser } from "./providerState/browser";
import {
	defaultModelPerProvider,
	findExactModelReferenceMatch,
	findInitialModel,
	hasDefaultModelProvider,
} from "./providerState/modelResolver";
import {
	type Api,
	type Model,
	modelsAreEqual,
	type OAuthProviderId,
} from "./providerState/piSource";
import {
	createSessionServices,
	type SessionServices,
} from "./providerState/services";
import type { SessionRevertState } from "./providerState/sessionStore";
import type { SessionRenameDialogState } from "./SessionRenameDialog";
import {
	buildSessionModifiedFiles,
	type SessionModifiedFile,
} from "./sessionFileDiff";
import { sessionReducer } from "./sessionReducer";
import {
	applySessionRevert,
	cleanupSessionRevert,
	cloneSessionPatchesBefore,
	getRevertedUserMessages,
	getVisibleSessionMessages,
	unrevertSession,
} from "./sessionRevert";
import {
	createInitialSessionState,
	getSubmittedComposerHistory,
	getUserMessageText,
	type ToolExecutionState,
} from "./types";

type ActivePickerState =
	| { kind: "provider"; mode: "login" | "logout" }
	| { kind: "model"; query: string }
	| { kind: "sessions" };

type PendingLoginInput = {
	resolve: (value: string) => void;
	reject: (error: Error) => void;
};

type MessageActionTarget = {
	timestamp: number;
	text: string;
};

type ForkSessionTarget = {
	sessionId: string;
	message: UserMessage;
	messageIndex: number;
};

type SessionRuntimeEntry = {
	id: string;
	title: string;
	revert: SessionRevertState | null;
	pendingTurnSnapshotId: string | null;
	runtime: AgentRuntimeLike;
	toolExecutions: Map<string, ToolExecutionState>;
	pendingBashMessages: BashExecutionMessage[];
	composerShellAbort: AbortController | null;
	unsubscribe: () => void;
};

const DEFAULT_SESSION_TITLE = "New session";

function getForkedTitle(title: string) {
	const match = title.match(/^(.+) \(fork #(\d+)\)$/);
	if (match) {
		const base = match[1];
		const number = Number.parseInt(match[2] ?? "0", 10);
		return `${base} (fork #${number + 1})`;
	}
	return `${title} (fork #1)`;
}

function getModelPickerItemId(model: Model<Api>) {
	return `${model.provider}/${model.id}`;
}

function parseModelPickerItemId(itemId: string) {
	const slashIndex = itemId.indexOf("/");
	if (slashIndex < 0) {
		return null;
	}

	return {
		provider: itemId.slice(0, slashIndex),
		modelId: itemId.slice(slashIndex + 1),
	};
}

function getSortedModels(
	currentModel: Model<Api> | null,
	models: Model<Api>[],
) {
	return [...models].sort((left, right) => {
		const leftIsCurrent = modelsAreEqual(currentModel, left);
		const rightIsCurrent = modelsAreEqual(currentModel, right);
		if (leftIsCurrent && !rightIsCurrent) {
			return -1;
		}
		if (!leftIsCurrent && rightIsCurrent) {
			return 1;
		}
		if (left.provider !== right.provider) {
			return left.provider.localeCompare(right.provider);
		}
		return 0;
	});
}

function getMatchingModels(
	currentModel: Model<Api> | null,
	models: Model<Api>[],
	query: string,
) {
	const sortedModels = getSortedModels(currentModel, models);
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return sortedModels;
	}

	return sortedModels
		.map((model, index) => {
			const canonicalId = `${model.provider}/${model.id}`.toLowerCase();
			const normalizedId = model.id.toLowerCase();
			const normalizedName = model.name.toLowerCase();
			const normalizedProvider = model.provider.toLowerCase();
			const prefixMatch =
				canonicalId.startsWith(normalizedQuery) ||
				normalizedId.startsWith(normalizedQuery) ||
				normalizedName.startsWith(normalizedQuery) ||
				normalizedProvider.startsWith(normalizedQuery);
			const includesMatch =
				prefixMatch ||
				canonicalId.includes(normalizedQuery) ||
				normalizedId.includes(normalizedQuery) ||
				normalizedName.includes(normalizedQuery) ||
				normalizedProvider.includes(normalizedQuery);

			if (!includesMatch) {
				return null;
			}

			return { model, index, prefixMatch };
		})
		.filter(
			(
				entry,
			): entry is { model: Model<Api>; index: number; prefixMatch: boolean } =>
				entry !== null,
		)
		.sort((left, right) => {
			if (left.prefixMatch !== right.prefixMatch) {
				return left.prefixMatch ? -1 : 1;
			}

			return left.index - right.index;
		})
		.map((entry) => entry.model);
}

function getAvailableProviderCount(services: SessionServices) {
	return new Set(
		services.modelRegistry.getAvailable().map((model) => model.provider),
	).size;
}

function createRuntimeSnapshot(
	runtime: AgentRuntimeLike,
	toolExecutions: Map<string, ToolExecutionState>,
	pendingBashMessages: BashExecutionMessage[],
) {
	const streamingMessage = runtime.agent.state.streamingMessage;
	return {
		messages: runtime.agent.state.messages.slice(),
		pendingBashMessages,
		streamingMessage:
			streamingMessage && streamingMessage.role === "assistant"
				? streamingMessage
				: null,
		toolExecutions: Array.from(toolExecutions.values()),
		isStreaming: runtime.agent.state.isStreaming,
		errorMessage: runtime.agent.state.errorMessage ?? null,
	};
}

export function useSessionController(
	providedServices?: SessionServices,
	initialSessionId: string | null = null,
) {
	const renderer = useRenderer();
	const servicesRef = useRef<SessionServices | null>(null);
	if (servicesRef.current === null) {
		servicesRef.current = providedServices ?? createSessionServices();
	}
	const services = servicesRef.current;
	const runtimeRef = useRef<AgentRuntimeLike | null>(null);
	const sessionsRef = useRef<Map<string, SessionRuntimeEntry>>(new Map());
	const composerMenuOpenRef = useRef(false);
	const pendingLoginInputRef = useRef<PendingLoginInput | null>(null);
	const loginAbortControllerRef = useRef<AbortController | null>(null);
	const loginLineIdRef = useRef(0);
	const sessionRenameValueRef = useRef("");
	const [commandNotice, setCommandNotice] = useState<string | null>(null);
	const [dismissComposerMenuToken, setDismissComposerMenuToken] = useState(0);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);
	const [sessionSidebarModifiedFiles, setSessionSidebarModifiedFiles] =
		useState<SessionModifiedFile[]>([]);
	const [activePicker, setActivePicker] = useState<ActivePickerState | null>(
		null,
	);
	const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<
		string | null
	>(null);
	const [messageActionTarget, setMessageActionTarget] =
		useState<MessageActionTarget | null>(null);
	const [sessionRenameDialogState, setSessionRenameDialogState] =
		useState<SessionRenameDialogState | null>(null);
	const [loginDialogState, setLoginDialogState] =
		useState<LoginDialogState | null>(null);
	const [activeModel, setActiveModel] = useState<Model<Api> | null>(() => {
		services.modelRegistry.refresh();

		return (
			findInitialModel({
				defaultProvider: services.settingsManager.getDefaultProvider(),
				defaultModelId: services.settingsManager.getDefaultModel(),
				modelRegistry: services.modelRegistry,
			}) ?? null
		);
	});
	const [state, dispatch] = useReducer(
		sessionReducer,
		createInitialSessionState(),
	);

	const activePickerRef = useRef<ActivePickerState | null>(null);
	const activeModelRef = useRef<Model<Api> | null>(activeModel);
	const loginDialogStateRef = useRef<LoginDialogState | null>(loginDialogState);
	const activeSessionIdRef = useRef<string | null>(activeSessionId);

	activePickerRef.current = activePicker;
	activeModelRef.current = activeModel;
	loginDialogStateRef.current = loginDialogState;
	activeSessionIdRef.current = activeSessionId;

	const syncRuntimeState = useCallback(() => {
		const runtime = runtimeRef.current;
		const sessionId = activeSessionIdRef.current;
		const activeEntry = sessionId ? sessionsRef.current.get(sessionId) : null;
		if (!runtime) {
			dispatch({
				type: "runtimeStateReplaced",
				messages: [],
				pendingBashMessages: [],
				streamingMessage: null,
				toolExecutions: [],
				isStreaming: false,
				errorMessage: null,
			});
			return;
		}
		dispatch({
			type: "runtimeStateReplaced",
			...createRuntimeSnapshot(
				runtime,
				activeEntry?.toolExecutions ?? new Map(),
				activeEntry?.pendingBashMessages ?? [],
			),
		});
	}, []);

	const setDraft = useCallback((value: string) => {
		if (value) {
			setCommandNotice(null);
		}

		dispatch({ type: "draftChanged", value });
	}, []);

	const findUserMessageIndex = useCallback(
		(messages: AgentMessage[], target: MessageActionTarget) =>
			messages.findIndex(
				(message) =>
					message.role === "user" &&
					message.timestamp === target.timestamp &&
					getUserMessageText(message) === target.text,
			),
		[],
	);

	const pruneUnreferencedSnapshots = useCallback(() => {
		services.workspaceSnapshotStore.pruneReferencedSnapshotIds(
			services.sessionStore.listReferencedSnapshotIds(),
		);
	}, [services]);

	const buildSessionRuntime = useCallback(
		(
			sessionId: string,
			model: Model<Api> | null,
			revert: SessionRevertState | null,
			initialMessages?: AgentMessage[],
		) => {
			const runtime =
				services.createRuntime?.(model, {
					sessionId,
					initialMessages,
				}) ??
				(model
					? new SuperskyAgentRuntime({
							authStorage: services.authStorage,
							cwd: services.workspaceRoot,
							model,
							sessionId,
							initialMessages: initialMessages ?? [],
						})
					: null);
			if (!runtime) {
				return null;
			}
			const toolExecutions = new Map<string, ToolExecutionState>();
			const unsubscribe = runtime.subscribe((event: AgentEvent) => {
				try {
					const entry = sessionsRef.current.get(sessionId);
					if (!entry) {
						return;
					}
					switch (event.type) {
						case "turn_start": {
							entry.pendingTurnSnapshotId =
								services.workspaceSnapshotStore.track();
							break;
						}
						case "turn_end": {
							const snapshotId = entry.pendingTurnSnapshotId;
							entry.pendingTurnSnapshotId = null;
							if (snapshotId) {
								const patch = services.workspaceSnapshotStore.patch(snapshotId);
								if (patch.files.length > 0) {
									services.sessionStore.addSessionPatch(sessionId, {
										messageTimestamp: event.message.timestamp,
										snapshotId: patch.snapshotId,
										files: patch.files,
									});
									pruneUnreferencedSnapshots();
								}
							}
							break;
						}
						case "tool_execution_start": {
							const previous = toolExecutions.get(event.toolCallId);
							toolExecutions.set(event.toolCallId, {
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: event.args,
								status: "running",
								result: previous?.result,
								isError: previous?.isError,
							});
							break;
						}
						case "tool_execution_update": {
							toolExecutions.set(event.toolCallId, {
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: event.args,
								status: "running",
								result: event.partialResult,
								isError: false,
							});
							break;
						}
						case "tool_execution_end": {
							toolExecutions.set(event.toolCallId, {
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: toolExecutions.get(event.toolCallId)?.args ?? {},
								status: event.isError ? "error" : "completed",
								result: event.result,
								isError: event.isError,
							});
							break;
						}
						case "agent_end": {
							toolExecutions.clear();
							if (entry && entry.pendingBashMessages.length > 0) {
								for (const bashMessage of entry.pendingBashMessages) {
									runtime.agent.state.messages.push(bashMessage);
								}
								entry.pendingBashMessages = [];
							}
							break;
						}
					}
					services.sessionStore.replaceSessionMessages(
						sessionId,
						runtime.agent.state.messages,
					);
					if (activeSessionIdRef.current === sessionId) {
						syncRuntimeState();
					}
				} catch (error: unknown) {
					setCommandNotice(
						error instanceof Error ? error.message : String(error),
					);
				}
			});
			const entry: SessionRuntimeEntry = {
				id: sessionId,
				title: "New session",
				revert,
				pendingTurnSnapshotId: null,
				runtime,
				toolExecutions,
				pendingBashMessages: [],
				composerShellAbort: null,
				unsubscribe,
			};
			sessionsRef.current.set(sessionId, entry);
			return entry;
		},
		[pruneUnreferencedSnapshots, services, syncRuntimeState],
	);

	const activateSession = useCallback(
		(sessionId: string) => {
			const entry = sessionsRef.current.get(sessionId);
			if (!entry) return null;
			setMessageActionTarget(null);
			runtimeRef.current = entry.runtime;
			setActiveSessionId(sessionId);
			setShowWelcomeScreen(false);
			services.sessionStore.setLastActiveSessionId(sessionId);
			syncRuntimeState();
			return entry.runtime;
		},
		[services, syncRuntimeState],
	);

	const createAndActivateSession = useCallback(
		(
			model: Model<Api> | null,
			options?: {
				initialMessages?: AgentMessage[];
				parentSessionId?: string | null;
			},
		) => {
			const sessionId = crypto.randomUUID();
			const entry = buildSessionRuntime(
				sessionId,
				model,
				null,
				options?.initialMessages,
			);
			if (!entry) {
				return null;
			}
			services.sessionStore.createSession({
				id: sessionId,
				title: "New session",
				workspaceRoot: services.workspaceRoot,
				model,
				parentSessionId: options?.parentSessionId,
			});
			if (options?.initialMessages) {
				services.sessionStore.replaceSessionMessages(
					sessionId,
					options.initialMessages,
				);
			}
			activateSession(sessionId);
			return entry.runtime;
		},
		[activateSession, buildSessionRuntime, services],
	);

	const ensureActiveRuntime = useCallback(
		(model: Model<Api> | null) => {
			if (runtimeRef.current) {
				if (model) {
					runtimeRef.current.setModel(model);
				}
				return runtimeRef.current;
			}
			if (!model) {
				return createAndActivateSession(null);
			}
			return createAndActivateSession(model);
		},
		[createAndActivateSession],
	);

	const cleanupRuntimeRevert = useCallback(
		(sessionId: string) => {
			const entry = sessionsRef.current.get(sessionId);
			if (!entry?.revert) {
				return false;
			}

			const nextMessages = cleanupSessionRevert(
				services,
				sessionId,
				entry.runtime.agent.state.messages,
			);
			entry.revert = null;
			entry.pendingBashMessages = [];
			entry.pendingTurnSnapshotId = null;
			entry.toolExecutions.clear();
			entry.runtime.reset();
			entry.runtime.agent.state.messages = nextMessages;
			if (activeSessionIdRef.current === sessionId) {
				syncRuntimeState();
			}
			return true;
		},
		[services, syncRuntimeState],
	);

	useEffect(() => {
		const fallbackModel = activeModelRef.current;
		if (initialSessionId) {
			const target = services.sessionStore
				.listSessions(200)
				.find((session) => session.id === initialSessionId);
			if (!target) {
				setCommandNotice(`Session not found: ${initialSessionId}`);
				syncRuntimeState();
				return;
			}

			const stored = services.sessionStore.getSession(target.id);
			const storedModel =
				target.modelProvider && target.modelId
					? services.modelRegistry.find(target.modelProvider, target.modelId)
					: null;
			const entry = buildSessionRuntime(
				target.id,
				storedModel ?? fallbackModel,
				stored?.revert ?? target.revert,
				stored?.messages,
			);
			if (!entry) {
				syncRuntimeState();
				return;
			}
			entry.title = target.title;
			void activateSession(target.id);
			return;
		}

		syncRuntimeState();
	}, [
		activateSession,
		buildSessionRuntime,
		initialSessionId,
		services,
		syncRuntimeState,
	]);

	useEffect(() => {
		return () => {
			for (const entry of sessionsRef.current.values()) {
				entry.unsubscribe();
				entry.runtime.abort();
			}
			sessionsRef.current.clear();
		};
	}, []);

	const createLoginLine = useCallback(
		(tone: LoginDialogLineTone, text: string) => {
			loginLineIdRef.current += 1;
			return {
				id: `login-line-${loginLineIdRef.current}`,
				tone,
				text,
			};
		},
		[],
	);

	const setLoginInputState = useCallback(
		(
			inputMode: LoginDialogState["inputMode"],
			inputPrompt?: string,
			inputPlaceholder?: string,
		) => {
			setLoginDialogState((currentState) => {
				if (!currentState) {
					return currentState;
				}

				return {
					...currentState,
					inputMode,
					inputPrompt,
					inputPlaceholder,
					inputValue: "",
				};
			});
		},
		[],
	);

	const waitForLoginInput = useCallback(() => {
		return new Promise<string>((resolve, reject) => {
			pendingLoginInputRef.current = { resolve, reject };
		});
	}, []);

	const closeActivePicker = useCallback(() => {
		setActivePicker(null);
		setPendingDeleteSessionId(null);
	}, []);

	const cancelLoginDialog = useCallback(() => {
		loginAbortControllerRef.current?.abort();
		loginAbortControllerRef.current = null;
		pendingLoginInputRef.current?.reject(new Error("Login cancelled"));
		pendingLoginInputRef.current = null;
		setLoginDialogState(null);
	}, []);

	const setLoginDialogInputValue = useCallback((value: string) => {
		setLoginDialogState((currentState) => {
			if (!currentState) {
				return currentState;
			}

			return {
				...currentState,
				inputValue: value,
			};
		});
	}, []);

	const submitLoginDialogInput = useCallback(() => {
		const currentDialogState = loginDialogStateRef.current;
		const pendingInput = pendingLoginInputRef.current;
		if (!currentDialogState || !pendingInput) {
			return;
		}

		pendingLoginInputRef.current = null;
		pendingInput.resolve(currentDialogState.inputValue);
		setLoginInputState("hidden");
	}, [setLoginInputState]);

	const setSessionRenameValue = useCallback((value: string) => {
		sessionRenameValueRef.current = value;
		setSessionRenameDialogState((current) =>
			current
				? {
						...current,
						value,
					}
				: current,
		);
	}, []);

	const closeSessionRenameDialog = useCallback(
		(restoreSessionsDialog: boolean) => {
			sessionRenameValueRef.current = "";
			setSessionRenameDialogState(null);
			if (restoreSessionsDialog) {
				setPendingDeleteSessionId(null);
				setActivePicker({ kind: "sessions" });
			}
		},
		[],
	);

	const cancelSessionRename = useCallback(() => {
		closeSessionRenameDialog(
			Boolean(sessionRenameDialogState?.returnToSessionsDialog),
		);
	}, [closeSessionRenameDialog, sessionRenameDialogState]);

	const updateSessionTitle = useCallback(
		(sessionId: string, title: string) => {
			services.sessionStore.updateSessionTitle(sessionId, title);
			const entry = sessionsRef.current.get(sessionId);
			if (entry) {
				entry.title = title;
			}
		},
		[services],
	);

	const maybeAutoRenameSession = useCallback(
		(sessionId: string, model: Model<Api> | null, firstMessage: string) => {
			if (!model || !services.generateSessionTitle) {
				return;
			}
			const currentTitle =
				sessionsRef.current.get(sessionId)?.title ??
				services.sessionStore.getSession(sessionId)?.title;
			if (currentTitle !== DEFAULT_SESSION_TITLE) {
				return;
			}
			void services
				.generateSessionTitle({
					model,
					sessionId,
					firstMessage,
				})
				.then((nextTitle) => {
					if (!nextTitle) {
						return;
					}
					const latestTitle =
						sessionsRef.current.get(sessionId)?.title ??
						services.sessionStore.getSession(sessionId)?.title;
					if (latestTitle !== DEFAULT_SESSION_TITLE) {
						return;
					}
					updateSessionTitle(sessionId, nextTitle);
					if (activeSessionIdRef.current === sessionId) {
						syncRuntimeState();
					}
				})
				.catch(() => {
					// Keep the default title if generating a short title fails.
				});
		},
		[services, syncRuntimeState, updateSessionTitle],
	);

	const copySessionId = useCallback(async (sessionId: string) => {
		await copyToClipboard(sessionId);
		setCommandNotice("Session ID copied to clipboard.");
	}, []);

	const copySessionIdFromPicker = useCallback(
		(sessionId: string) => {
			void copySessionId(sessionId).catch((error: unknown) => {
				setCommandNotice(
					error instanceof Error ? error.message : String(error),
				);
			});
		},
		[copySessionId],
	);

	const openMessageActions = useCallback((message: UserMessage) => {
		setCommandNotice(null);
		setMessageActionTarget({
			timestamp: message.timestamp,
			text: getUserMessageText(message),
		});
	}, []);

	const closeMessageActions = useCallback(() => {
		setMessageActionTarget(null);
	}, []);

	const activeMessageAction = useMemo(() => {
		if (!messageActionTarget) {
			return null;
		}

		const sessionId = activeSessionId;
		if (!sessionId) {
			return null;
		}

		const messageIndex = findUserMessageIndex(
			state.messages,
			messageActionTarget,
		);
		if (messageIndex < 0) {
			return null;
		}

		const message = state.messages[messageIndex];
		if (!message || message.role !== "user") {
			return null;
		}

		const entry = sessionsRef.current.get(sessionId);
		const isBusy = state.isStreaming || Boolean(entry?.composerShellAbort);

		return {
			sessionId,
			message,
			messageIndex,
			isBusy,
		};
	}, [
		activeSessionId,
		findUserMessageIndex,
		messageActionTarget,
		state.isStreaming,
		state.messages,
	]);

	const forkSessionAtMessage = useCallback(
		async (target: ForkSessionTarget) => {
			try {
				const currentEntry = sessionsRef.current.get(target.sessionId);
				const nextMessages = state.messages.slice(0, target.messageIndex);
				const nextTitle = getForkedTitle(
					currentEntry?.title ?? DEFAULT_SESSION_TITLE,
				);
				const runtime = createAndActivateSession(
					currentEntry?.runtime.agent.state.model ?? activeModelRef.current,
					{
						initialMessages: nextMessages,
						parentSessionId: target.sessionId,
					},
				);
				if (!runtime) {
					setCommandNotice("Unable to create a forked session.");
					return;
				}
				services.sessionStore.updateSessionTitle(runtime.sessionId, nextTitle);
				const runtimeEntry = sessionsRef.current.get(runtime.sessionId);
				if (runtimeEntry) {
					runtimeEntry.title = nextTitle;
				}
				services.sessionStore.replaceSessionMessages(
					runtime.sessionId,
					nextMessages,
				);
				services.sessionStore.replaceSessionPatches(
					runtime.sessionId,
					cloneSessionPatchesBefore(
						services.sessionStore.listSessionPatches(target.sessionId),
						target.message.timestamp,
					),
				);
				closeMessageActions();
				queueMicrotask(() => {
					setDraft(getUserMessageText(target.message));
				});
			} catch (error: unknown) {
				setCommandNotice(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
		[
			closeMessageActions,
			createAndActivateSession,
			services,
			setDraft,
			state.messages,
		],
	);

	const copyMessageFromActions = useCallback(async () => {
		if (!activeMessageAction) {
			return;
		}
		try {
			await copyToClipboard(getUserMessageText(activeMessageAction.message));
			closeMessageActions();
			setCommandNotice("Message copied to clipboard.");
		} catch (error: unknown) {
			setCommandNotice(error instanceof Error ? error.message : String(error));
		}
	}, [activeMessageAction, closeMessageActions]);

	const forkSessionFromMessage = useCallback(async () => {
		if (!activeMessageAction) {
			return;
		}
		if (activeMessageAction.isBusy) {
			setCommandNotice("Wait for the active session to finish before forking.");
			return;
		}

		await forkSessionAtMessage(activeMessageAction);
	}, [activeMessageAction, forkSessionAtMessage]);

	const revertSessionToMessage = useCallback(async () => {
		if (!activeMessageAction) {
			return;
		}
		if (activeMessageAction.isBusy) {
			setCommandNotice(
				"Wait for the active session to finish before reverting.",
			);
			return;
		}

		try {
			const entry = sessionsRef.current.get(activeMessageAction.sessionId);
			if (!entry) {
				return;
			}

			entry.revert = applySessionRevert(
				services,
				activeMessageAction.sessionId,
				activeMessageAction.message.timestamp,
			);
			setDraft(getUserMessageText(activeMessageAction.message));
			closeMessageActions();
			syncRuntimeState();
		} catch (error: unknown) {
			setCommandNotice(error instanceof Error ? error.message : String(error));
		}
	}, [
		activeMessageAction,
		closeMessageActions,
		services,
		setDraft,
		syncRuntimeState,
	]);

	const redoSessionRevert = useCallback(() => {
		const sessionId = activeSessionIdRef.current;
		if (!sessionId) {
			return;
		}
		const entry = sessionsRef.current.get(sessionId);
		if (!entry?.revert) {
			return;
		}
		if (state.isStreaming || entry.composerShellAbort) {
			setCommandNotice("Wait for the active session to finish before redoing.");
			return;
		}
		const revert = entry.revert;

		const nextUserMessage = state.messages.find(
			(message) =>
				message.role === "user" && message.timestamp > revert.messageTimestamp,
		);
		if (!nextUserMessage || nextUserMessage.role !== "user") {
			unrevertSession(services, sessionId);
			entry.revert = null;
			setDraft("");
			syncRuntimeState();
			return;
		}

		entry.revert = applySessionRevert(
			services,
			sessionId,
			nextUserMessage.timestamp,
		);
		syncRuntimeState();
	}, [services, setDraft, state.isStreaming, state.messages, syncRuntimeState]);

	const submitSessionRename = useCallback(() => {
		const dialog = sessionRenameDialogState;
		if (!dialog) {
			return;
		}
		const nextTitle =
			sessionRenameValueRef.current.trim() || DEFAULT_SESSION_TITLE;
		updateSessionTitle(dialog.sessionId, nextTitle);
		closeSessionRenameDialog(Boolean(dialog.returnToSessionsDialog));
		setCommandNotice("Session renamed.");
	}, [closeSessionRenameDialog, sessionRenameDialogState, updateSessionTitle]);

	const selectModel = useCallback(
		(model: Model<Api>) => {
			services.settingsManager.setDefaultModelAndProvider(
				model.provider,
				model.id,
			);
			const sessionId = activeSessionIdRef.current;
			if (sessionId) {
				const entry = sessionsRef.current.get(sessionId);
				entry?.runtime.setModel(model);
				services.sessionStore.updateSessionModel(sessionId, model);
			}
			setActiveModel(model);
			setActivePicker(null);
			syncRuntimeState();
		},
		[services, syncRuntimeState],
	);

	const exitSession = useCallback(() => {
		setCommandNotice(null);
		destroyRendererAndExit(renderer);
	}, [renderer]);

	const resetSession = useCallback(() => {
		setCommandNotice(null);
		setActivePicker(null);
		setMessageActionTarget(null);
		runtimeRef.current = null;
		setActiveSessionId(null);
		services.sessionStore.setLastActiveSessionId(null);
		setShowWelcomeScreen(true);
		dispatch({ type: "sessionReset" });
		syncRuntimeState();
	}, [services, syncRuntimeState]);

	const openRenameDialog = useCallback(
		(sessionId: string, options?: { returnToSessionsDialog?: boolean }) => {
			const summary = services.sessionStore
				.listSessions(500)
				.find((session) => session.id === sessionId);
			if (!summary) {
				return;
			}
			sessionRenameValueRef.current = summary.title;
			setSessionRenameDialogState({
				sessionId,
				value: summary.title,
				returnToSessionsDialog: options?.returnToSessionsDialog,
			});
		},
		[services],
	);

	const confirmDeleteSession = useCallback(
		(sessionId: string) => {
			const activeId = activeSessionIdRef.current;
			setMessageActionTarget(null);
			const entry = sessionsRef.current.get(sessionId);
			entry?.runtime.abort();
			entry?.unsubscribe();
			sessionsRef.current.delete(sessionId);
			services.sessionStore.deleteSession(sessionId);
			pruneUnreferencedSnapshots();
			setPendingDeleteSessionId(null);
			if (activeId === sessionId) {
				const fallback = services.sessionStore.listSessions(1)[0];
				if (fallback) {
					const stored = services.sessionStore.getSession(fallback.id);
					const model =
						(fallback.modelProvider && fallback.modelId
							? services.modelRegistry.find(
									fallback.modelProvider,
									fallback.modelId,
								)
							: null) ?? activeModelRef.current;
					if (model) {
						const runtimeEntry =
							sessionsRef.current.get(fallback.id) ??
							buildSessionRuntime(
								fallback.id,
								model,
								stored?.revert ?? fallback.revert,
								stored?.messages,
							);
						if (!runtimeEntry) {
							return;
						}
						runtimeEntry.title = fallback.title;
						void activateSession(fallback.id);
					}
				} else {
					runtimeRef.current = null;
					setActiveSessionId(null);
					setShowWelcomeScreen(true);
					dispatch({ type: "sessionReset" });
					syncRuntimeState();
				}
			}
			setCommandNotice("Session deleted.");
		},
		[
			activateSession,
			buildSessionRuntime,
			pruneUnreferencedSnapshots,
			services,
			syncRuntimeState,
		],
	);

	const clearPendingSessionDelete = useCallback(() => {
		setPendingDeleteSessionId(null);
	}, []);

	const toggleSessionDelete = useCallback(
		(sessionId: string) => {
			if (pendingDeleteSessionId === sessionId) {
				confirmDeleteSession(sessionId);
				return;
			}

			setPendingDeleteSessionId(sessionId);
		},
		[confirmDeleteSession, pendingDeleteSessionId],
	);

	const beginLoginFlow = useCallback(
		async (providerId: string) => {
			const providerInfo = services.authStorage
				.getOAuthProviders()
				.find((provider) => provider.id === providerId);
			if (!providerInfo) {
				return;
			}

			const providerName = providerInfo.name || providerId;
			const previousModel = activeModelRef.current;
			loginAbortControllerRef.current = new AbortController();
			pendingLoginInputRef.current = null;
			setActivePicker(null);
			setCommandNotice(null);
			setLoginDialogState({
				providerId,
				providerName,
				lines: [],
				inputMode: "hidden",
				inputValue: "",
			});

			try {
				await services.authStorage.login(providerId as OAuthProviderId, {
					onAuth: ({ url, instructions }) => {
						const lines = [
							createLoginLine("accent", url),
							createLoginLine(
								"muted",
								process.platform === "darwin"
									? "Cmd+click to open"
									: "Ctrl+click to open",
							),
						];
						if (instructions) {
							lines.push(createLoginLine("warning", instructions));
						}

						setLoginDialogState((currentState) => {
							if (!currentState) {
								return currentState;
							}

							return {
								...currentState,
								lines,
							};
						});

						if (providerInfo.usesCallbackServer) {
							setLoginInputState(
								"manual",
								"Paste redirect URL below, or complete login in browser:",
							);
						} else if (providerId === "github-copilot") {
							setLoginDialogState((currentState) => {
								if (!currentState) {
									return currentState;
								}

								return {
									...currentState,
									lines: [
										...currentState.lines,
										createLoginLine(
											"muted",
											"Waiting for browser authentication...",
										),
									],
								};
							});
						}

						try {
							openUrlInBrowser(url);
						} catch {
							// Ignore browser-launch failures; the login URL is already visible.
						}
					},
					onPrompt: async (prompt) => {
						setLoginDialogState((currentState) => {
							if (!currentState) {
								return currentState;
							}

							return {
								...currentState,
								lines: [
									...currentState.lines,
									createLoginLine("text", prompt.message),
									...(prompt.placeholder
										? [createLoginLine("muted", `e.g., ${prompt.placeholder}`)]
										: []),
								],
							};
						});
						setLoginInputState("prompt", prompt.message, prompt.placeholder);
						return waitForLoginInput();
					},
					onProgress: (message) => {
						setLoginDialogState((currentState) => {
							if (!currentState) {
								return currentState;
							}

							return {
								...currentState,
								lines: [
									...currentState.lines,
									createLoginLine("muted", message),
								],
							};
						});
					},
					onManualCodeInput: async () => waitForLoginInput(),
					signal: loginAbortControllerRef.current.signal,
				});

				services.modelRegistry.refresh();

				let selectedModel: Model<Api> | undefined;
				let selectionError: string | undefined;
				if (!previousModel) {
					const providerModels = services.modelRegistry
						.getAvailable()
						.filter((model) => model.provider === providerId);

					if (!hasDefaultModelProvider(providerId)) {
						selectionError = `Logged in to ${providerName}, but no default model is configured for provider "${providerId}". Use /model to select a model.`;
					} else if (providerModels.length === 0) {
						selectionError = `Logged in to ${providerName}, but no models are available for that provider. Use /model to select a model.`;
					} else {
						const defaultModelId =
							defaultModelPerProvider[
								providerId as keyof typeof defaultModelPerProvider
							];
						selectedModel = providerModels.find(
							(model) => model.id === defaultModelId,
						);
						if (!selectedModel) {
							selectionError = `Logged in to ${providerName}, but its default model "${defaultModelId}" is not available. Use /model to select a model.`;
						}
					}
				}

				if (selectedModel) {
					selectModel(selectedModel);
					setCommandNotice(
						`Logged in to ${providerName}. Selected ${selectedModel.id}. Credentials saved to ${services.paths.authPath}`,
					);
				} else {
					setCommandNotice(
						selectionError
							? `${selectionError} Credentials saved to ${services.paths.authPath}`
							: `Logged in to ${providerName}. Credentials saved to ${services.paths.authPath}`,
					);
				}
			} catch (error: unknown) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				if (errorMessage !== "Login cancelled") {
					setCommandNotice(
						`Failed to login to ${providerName}: ${errorMessage}`,
					);
				}
			} finally {
				loginAbortControllerRef.current = null;
				pendingLoginInputRef.current = null;
				setLoginDialogState(null);
			}
		},
		[
			createLoginLine,
			selectModel,
			services,
			setLoginInputState,
			waitForLoginInput,
		],
	);

	const logoutProvider = useCallback(
		(providerId: string) => {
			const providerInfo = services.authStorage
				.getOAuthProviders()
				.find((provider) => provider.id === providerId);
			const providerName = providerInfo?.name ?? providerId;

			services.authStorage.logout(providerId);
			services.modelRegistry.refresh();
			const currentModel = activeModelRef.current;
			if (currentModel && currentModel.provider === providerId) {
				const fallbackModel =
					findInitialModel({
						defaultProvider: services.settingsManager.getDefaultProvider(),
						defaultModelId: services.settingsManager.getDefaultModel(),
						modelRegistry: services.modelRegistry,
					}) ?? null;
				setActiveModel(fallbackModel);
				if (fallbackModel) {
					runtimeRef.current?.setModel(fallbackModel);
				} else {
					runtimeRef.current?.abort();
					runtimeRef.current = null;
					syncRuntimeState();
				}
			}
			setActivePicker(null);
			setCommandNotice(`Logged out of ${providerName}`);
		},
		[services, syncRuntimeState],
	);

	const setComposerMenuOpen = useCallback((open: boolean) => {
		composerMenuOpenRef.current = open;
	}, []);

	const showPreviousHistory = useCallback(() => {
		dispatch({
			type: "historyPrevious",
			committedMessages: getVisibleSessionMessages(
				state.messages,
				(activeSessionIdRef.current
					? sessionsRef.current.get(activeSessionIdRef.current)?.revert
					: null) ?? null,
			),
		});
	}, [state.messages]);

	const showNextHistory = useCallback(() => {
		dispatch({
			type: "historyNext",
			committedMessages: getVisibleSessionMessages(
				state.messages,
				(activeSessionIdRef.current
					? sessionsRef.current.get(activeSessionIdRef.current)?.revert
					: null) ?? null,
			),
		});
	}, [state.messages]);

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

				if (slashCommand.command.name === LOGIN_COMMAND) {
					setActivePicker({ kind: "provider", mode: "login" });
					return;
				}

				if (slashCommand.command.name === LOGOUT_COMMAND) {
					const hasLoggedInProvider = services.authStorage
						.getOAuthProviders()
						.some(
							(provider) =>
								services.authStorage.get(provider.id)?.type === "oauth",
						);
					if (!hasLoggedInProvider) {
						setCommandNotice("No OAuth providers logged in. Use /login first.");
						return;
					}

					setActivePicker({ kind: "provider", mode: "logout" });
					return;
				}

				if (slashCommand.command.name === MODEL_COMMAND) {
					const exactModelMatch = findExactModelReferenceMatch(
						slashCommand.argumentText,
						services.modelRegistry.getAvailable(),
					);
					if (exactModelMatch) {
						selectModel(exactModelMatch);
						return;
					}

					setActivePicker({ kind: "model", query: slashCommand.argumentText });
					return;
				}

				if (slashCommand.command.name === SESSIONS_COMMAND) {
					setActivePicker({ kind: "sessions" });
					return;
				}

				if (slashCommand.command.name === FORK_COMMAND) {
					const sessionId = activeSessionIdRef.current;
					const currentEntry = sessionId
						? (sessionsRef.current.get(sessionId) ?? null)
						: null;
					if (!sessionId || !currentEntry) {
						setCommandNotice("No active session to fork.");
						return;
					}

					if (state.isStreaming || currentEntry.composerShellAbort) {
						setCommandNotice(
							"Wait for the active session to finish before forking.",
						);
						return;
					}

					const visibleSessionMessages = getVisibleSessionMessages(
						state.messages,
						currentEntry.revert,
					);
					let forkTarget: ForkSessionTarget | null = null;
					for (
						let index = visibleSessionMessages.length - 1;
						index >= 0;
						index -= 1
					) {
						const message = visibleSessionMessages[index];
						if (!message || message.role !== "user") {
							continue;
						}

						const messageIndex = findUserMessageIndex(state.messages, {
							timestamp: message.timestamp,
							text: getUserMessageText(message),
						});
						if (messageIndex < 0) {
							continue;
						}

						forkTarget = {
							sessionId,
							message,
							messageIndex,
						};
						break;
					}

					if (!forkTarget) {
						setCommandNotice("No user message to fork from.");
						return;
					}

					void forkSessionAtMessage(forkTarget);
					return;
				}

				if (slashCommand.command.name === RENAME_COMMAND) {
					const sessionId = activeSessionIdRef.current;
					if (!sessionId) {
						setCommandNotice("No active session to rename.");
						return;
					}
					openRenameDialog(sessionId);
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

			if (text.startsWith("!")) {
				const excludeFromContext = text.startsWith("!!");
				const shellCommand = excludeFromContext
					? text.slice(2).trim()
					: text.slice(1).trim();
				if (!shellCommand) {
					return;
				}

				setShowWelcomeScreen(false);

				const runtime = runtimeRef.current;
				if (!runtime) {
					setCommandNotice("No active session.");
					return;
				}

				const sessionId = activeSessionIdRef.current;
				const entry = sessionId ? sessionsRef.current.get(sessionId) : null;
				if (!sessionId || !entry) {
					setCommandNotice("No active session.");
					return;
				}

				if (entry.composerShellAbort) {
					setCommandNotice(
						"A shell command is already running. Press Esc to cancel.",
					);
					return;
				}

				cleanupRuntimeRevert(sessionId);
				const beforeShellSnapshotId = services.workspaceSnapshotStore.track();

				const ac = new AbortController();
				entry.composerShellAbort = ac;

				void (async () => {
					try {
						const result = await executeUserShellCommand(
							runtime.cwd,
							shellCommand,
							ac.signal,
						);
						const bashMessage: BashExecutionMessage = {
							role: "bashExecution",
							command: shellCommand,
							output: result.output,
							exitCode: result.exitCode,
							cancelled: result.cancelled,
							truncated: result.truncated,
							fullOutputPath: result.fullOutputPath,
							timestamp: Date.now(),
							excludeFromContext,
						};

						const currentRuntime = runtimeRef.current;
						const currentEntry = sessionsRef.current.get(sessionId);
						if (
							!currentRuntime ||
							!currentEntry ||
							activeSessionIdRef.current !== sessionId
						) {
							return;
						}

						if (currentRuntime.agent.state.isStreaming) {
							currentEntry.pendingBashMessages.push(bashMessage);
						} else {
							currentRuntime.agent.state.messages.push(bashMessage);
							services.sessionStore.replaceSessionMessages(
								sessionId,
								currentRuntime.agent.state.messages,
							);
						}
						const shellPatch = services.workspaceSnapshotStore.patch(
							beforeShellSnapshotId,
						);
						if (shellPatch.files.length > 0) {
							services.sessionStore.addSessionPatch(sessionId, {
								messageTimestamp: bashMessage.timestamp,
								snapshotId: shellPatch.snapshotId,
								files: shellPatch.files,
							});
							pruneUnreferencedSnapshots();
						}
						setCommandNotice(null);
					} catch (error: unknown) {
						setCommandNotice(
							error instanceof Error ? error.message : String(error),
						);
					} finally {
						const currentEntry = sessionsRef.current.get(sessionId);
						if (currentEntry) {
							currentEntry.composerShellAbort = null;
						}
						if (activeSessionIdRef.current === sessionId) {
							syncRuntimeState();
						}
					}
				})();

				return;
			}

			const runtime = ensureActiveRuntime(activeModelRef.current);
			if (!runtime) {
				setCommandNotice(
					"No model selected. Use /login or /model to choose a model.",
				);
				return;
			}

			const userMessage: UserMessage = {
				role: "user",
				content: [{ type: "text", text }],
				timestamp: Date.now(),
			};
			cleanupRuntimeRevert(runtime.sessionId);
			const isFirstUserMessage = !runtime.agent.state.messages.some(
				(message) => message.role === "user",
			);

			setShowWelcomeScreen(false);
			dispatch({ type: "promptSubmitted", message: userMessage });
			if (isFirstUserMessage) {
				maybeAutoRenameSession(
					runtime.sessionId,
					runtime.agent.state.model,
					text,
				);
			}

			if (runtime.agent.state.isStreaming) {
				runtime.agent.followUp(userMessage);
				setCommandNotice("Queued message for the current session.");
				syncRuntimeState();
				return;
			}

			void runtime
				.prompt(userMessage)
				.then(() => {
					syncRuntimeState();
				})
				.catch((error: unknown) => {
					setCommandNotice(
						error instanceof Error ? error.message : String(error),
					);
					syncRuntimeState();
				});
		},
		[
			cleanupRuntimeRevert,
			ensureActiveRuntime,
			exitSession,
			findUserMessageIndex,
			forkSessionAtMessage,
			maybeAutoRenameSession,
			openRenameDialog,
			pruneUnreferencedSnapshots,
			resetSession,
			selectModel,
			services,
			state.isStreaming,
			state.messages,
			syncRuntimeState,
		],
	);

	const handleKeyboardInput = useCallback(
		(key: { name: string; ctrl: boolean; defaultPrevented?: boolean }) => {
			if (loginDialogStateRef.current) {
				if (key.name === "escape" || (key.ctrl && key.name === "c")) {
					cancelLoginDialog();
				}
				return;
			}

			if (key.name === "escape") {
				const shellSessionId = activeSessionIdRef.current;
				const shellEntry = shellSessionId
					? sessionsRef.current.get(shellSessionId)
					: null;
				if (shellEntry?.composerShellAbort) {
					shellEntry.composerShellAbort.abort();
					return;
				}

				if (activePickerRef.current) {
					setActivePicker(null);
					setPendingDeleteSessionId(null);
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

			if (activePickerRef.current?.kind === "sessions") {
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
		[cancelLoginDialog, exitSession, resetSession],
	);

	useKeyboard(handleKeyboardInput);

	const activeSessionEntry = activeSessionId
		? (sessionsRef.current.get(activeSessionId) ?? null)
		: null;
	const activeSessionRevert = activeSessionEntry?.revert ?? null;
	const visibleMessages = useMemo(
		() => getVisibleSessionMessages(state.messages, activeSessionRevert),
		[activeSessionRevert, state.messages],
	);
	const revertedUserMessages = useMemo(
		() => getRevertedUserMessages(state.messages, activeSessionRevert),
		[activeSessionRevert, state.messages],
	);

	const hasSubmittedUserMessages =
		getSubmittedComposerHistory([
			...visibleMessages,
			...state.pendingBashMessages,
			...state.pendingUserMessages,
		]).length > 0;

	const sessionSidebarUsage = useMemo(
		() =>
			buildSessionSidebarUsageLines(
				activeModel,
				[...visibleMessages, ...state.pendingBashMessages],
				state.streamingMessage,
				activeModel ? services.modelRegistry.isUsingOAuth(activeModel) : false,
			),
		[
			activeModel,
			state.pendingBashMessages,
			state.streamingMessage,
			visibleMessages,
			services.modelRegistry,
		],
	);

	useEffect(() => {
		let cancelled = false;
		void buildSessionModifiedFiles(
			visibleMessages,
			services.workspaceRoot,
		).then((rows) => {
			if (!cancelled) {
				setSessionSidebarModifiedFiles(rows);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [services.workspaceRoot, visibleMessages]);

	const currentSessionTitle =
		(activeSessionId
			? sessionsRef.current.get(activeSessionId)?.title
			: undefined) ?? DEFAULT_SESSION_TITLE;
	const revertBannerState = activeSessionRevert
		? {
				hiddenUserMessageCount: revertedUserMessages.length,
				diff: activeSessionRevert.diff,
			}
		: null;
	const messageActionsState = activeMessageAction
		? {
				revertDisabledReason: activeMessageAction.isBusy
					? "wait for the active session to finish"
					: undefined,
				forkDisabledReason: activeMessageAction.isBusy
					? "wait for the active session to finish"
					: undefined,
			}
		: null;

	const commandPickerState: CommandPickerState | null = (() => {
		if (!activePicker) {
			return null;
		}

		if (activePicker.kind === "provider") {
			const currentProviderId = activeModel?.provider ?? null;

			return {
				kind: "provider",
				title:
					activePicker.mode === "login"
						? "Select provider to login"
						: "Select provider to logout",
				helperText:
					activePicker.mode === "login"
						? "Press Enter to login."
						: "Press Enter to logout.",
				emptyText: "No OAuth providers available.",
				selectedItemId: currentProviderId,
				items: services.authStorage.getOAuthProviders().map((provider) => {
					const isCurrent = provider.id === currentProviderId;
					const isLoggedIn =
						services.authStorage.get(provider.id)?.type === "oauth";

					let meta: string | undefined;
					if (isCurrent && isLoggedIn) {
						meta = "Current / Logged in";
					} else if (isCurrent) {
						meta = "Current";
					} else if (isLoggedIn) {
						meta = "Logged in";
					}

					return {
						id: provider.id,
						label: provider.name,
						meta,
					};
				}),
			};
		}

		if (activePicker.kind === "sessions") {
			const summaries = services.sessionStore.listSessions(500);
			return {
				kind: "sessions",
				title: "Sessions",
				emptyText: "No sessions yet.",
				footerActions: [
					{ label: "delete", shortcut: "ctrl+d" },
					{ label: "rename", shortcut: "ctrl+r" },
					{ label: "copy", shortcut: "ctrl+k" },
				],
				selectedItemId: activeSessionId ?? undefined,
				pendingDeleteItemId: pendingDeleteSessionId,
				items: summaries.map((session) => {
					const runtimeEntry = sessionsRef.current.get(session.id);
					const isStreaming =
						runtimeEntry?.runtime.agent.state.isStreaming ?? false;
					return {
						id: session.id,
						label: session.title,
						updatedAt: session.updatedAt,
						isCurrent: session.id === activeSessionId,
						isStreaming,
						isDeletePending: pendingDeleteSessionId === session.id,
					};
				}),
			};
		}

		const matchingModels = getMatchingModels(
			activeModel,
			services.modelRegistry.getAvailable(),
			activePicker.query,
		);

		return {
			kind: "model",
			title: "Select model",
			helperText: activePicker.query
				? `Showing matches for ${activePicker.query}`
				: "Only showing models with configured API keys.",
			filterText: activePicker.query || undefined,
			emptyText:
				activePicker.query.length > 0
					? `No models match ${activePicker.query}.`
					: "No models available. Use /login or set an API key environment variable.",
			selectedItemId: activeModel ? getModelPickerItemId(activeModel) : null,
			items: matchingModels.map((model) => ({
				id: getModelPickerItemId(model),
				label: model.id,
				meta: `[${model.provider}]`,
			})),
		};
	})();

	const selectCommandPickerItem = useCallback(
		(itemId: string) => {
			const currentPicker = activePickerRef.current;
			if (!currentPicker) {
				return;
			}

			if (currentPicker.kind === "provider") {
				if (currentPicker.mode === "login") {
					void beginLoginFlow(itemId);
				} else {
					logoutProvider(itemId);
				}
				return;
			}

			if (currentPicker.kind === "sessions") {
				const currentSessionId = activeSessionIdRef.current;
				const currentEntry = currentSessionId
					? sessionsRef.current.get(currentSessionId)
					: null;
				if (
					currentEntry &&
					(currentEntry.runtime.agent.state.isStreaming ||
						Boolean(currentEntry.composerShellAbort))
				) {
					setCommandNotice(
						"Wait for the active session to finish before switching sessions.",
					);
					return;
				}
				const existing = sessionsRef.current.get(itemId);
				if (existing) {
					setActiveModel(existing.runtime.agent.state.model);
					void activateSession(itemId);
					setActivePicker(null);
					return;
				}
				const summary = services.sessionStore
					.listSessions(500)
					.find((session) => session.id === itemId);
				const stored = services.sessionStore.getSession(itemId);
				const fallbackModel = activeModelRef.current;
				const restoredModel =
					summary?.modelProvider && summary.modelId
						? services.modelRegistry.find(
								summary.modelProvider,
								summary.modelId,
							)
						: null;
				const selectedModel = restoredModel ?? fallbackModel;
				if (!stored) {
					return;
				}
				const entry = buildSessionRuntime(
					itemId,
					selectedModel ?? null,
					stored.revert,
					stored.messages,
				);
				if (!entry) {
					return;
				}
				entry.title = summary?.title ?? entry.title;
				if (selectedModel) {
					setActiveModel(selectedModel);
				}
				void activateSession(itemId);
				setActivePicker(null);
				return;
			}

			const modelReference = parseModelPickerItemId(itemId);
			if (!modelReference) {
				return;
			}

			const selectedModel = services.modelRegistry.find(
				modelReference.provider,
				modelReference.modelId,
			);
			if (
				!selectedModel ||
				!services.modelRegistry.hasConfiguredAuth(selectedModel)
			) {
				return;
			}

			selectModel(selectedModel);
		},
		[
			activateSession,
			beginLoginFlow,
			buildSessionRuntime,
			logoutProvider,
			selectModel,
			services,
		],
	);

	return {
		state,
		visibleMessages,
		revertBannerState,
		sessionSidebarUsage,
		sessionSidebarModifiedFiles,
		isNewSession: showWelcomeScreen,
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
		sessionTitle: currentSessionTitle,
		activeModel,
		toolDefinitions: runtimeRef.current?.toolDefinitions ?? {},
		availableProviderCount: getAvailableProviderCount(services),
		commandPickerState,
		closeCommandPicker: closeActivePicker,
		selectCommandPickerItem,
		copySessionIdFromPicker,
		openSessionRenameDialog: openRenameDialog,
		toggleSessionDelete,
		clearPendingSessionDelete,
		loginDialogState,
		setLoginDialogInputValue,
		submitLoginDialogInput,
		cancelLoginDialog,
		sessionRenameDialogState,
		setSessionRenameValue,
		submitSessionRename,
		cancelSessionRename,
		messageActionsState,
		openMessageActions,
		closeMessageActions,
		copyMessageFromActions,
		forkSessionFromMessage,
		revertSessionToMessage,
		redoSessionRevert,
	};
}
