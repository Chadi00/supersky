import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type AgentRuntimeLike, SuperskyAgentRuntime } from "../agent/runtime";
import { destroyRendererAndExit } from "../shared/lifecycle";
import type { AgentEvent } from "../vendor/pi-agent-core/index.js";
import type { CommandPickerState } from "./commandPicker";
import {
	EXIT_COMMAND,
	isExitCommand,
	isExitShortcut,
	isNewSessionShortcut,
	LOGIN_COMMAND,
	LOGOUT_COMMAND,
	MODEL_COMMAND,
	NEW_SESSION_COMMAND,
	parseSubmittedSlashCommand,
	SETTINGS_COMMAND,
} from "./commands";
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
import { sessionReducer } from "./sessionReducer";
import { createInitialSessionState, type ToolExecutionState } from "./types";

type ActivePickerState =
	| { kind: "provider"; mode: "login" | "logout" }
	| { kind: "model"; query: string };

type PendingLoginInput = {
	resolve: (value: string) => void;
	reject: (error: Error) => void;
};

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
) {
	const streamingMessage = runtime.agent.state.streamingMessage;
	return {
		messages: runtime.agent.state.messages.slice(),
		streamingMessage:
			streamingMessage && streamingMessage.role === "assistant"
				? streamingMessage
				: null,
		toolExecutions: Array.from(toolExecutions.values()),
		isStreaming: runtime.agent.state.isStreaming,
		errorMessage: runtime.agent.state.errorMessage ?? null,
	};
}

export function useSessionController(providedServices?: SessionServices) {
	const renderer = useRenderer();
	const servicesRef = useRef<SessionServices | null>(null);
	if (servicesRef.current === null) {
		servicesRef.current = providedServices ?? createSessionServices();
	}
	const services = servicesRef.current;
	const runtimeRef = useRef<AgentRuntimeLike | null>(null);
	const runtimeUnsubscribeRef = useRef<(() => void) | null>(null);
	const toolExecutionsRef = useRef<Map<string, ToolExecutionState>>(new Map());
	const composerMenuOpenRef = useRef(false);
	const pendingLoginInputRef = useRef<PendingLoginInput | null>(null);
	const loginAbortControllerRef = useRef<AbortController | null>(null);
	const loginLineIdRef = useRef(0);
	const [commandNotice, setCommandNotice] = useState<string | null>(null);
	const [dismissComposerMenuToken, setDismissComposerMenuToken] = useState(0);
	const [activePicker, setActivePicker] = useState<ActivePickerState | null>(
		null,
	);
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

	activePickerRef.current = activePicker;
	activeModelRef.current = activeModel;
	loginDialogStateRef.current = loginDialogState;

	const syncRuntimeState = useCallback(() => {
		const runtime = runtimeRef.current;
		if (!runtime) {
			dispatch({
				type: "runtimeStateReplaced",
				messages: [],
				streamingMessage: null,
				toolExecutions: [],
				isStreaming: false,
				errorMessage: null,
			});
			return;
		}
		dispatch({
			type: "runtimeStateReplaced",
			...createRuntimeSnapshot(runtime, toolExecutionsRef.current),
		});
	}, []);

	const ensureRuntime = useCallback(
		(model: Model<Api> | null) => {
			if (runtimeRef.current) {
				if (model) {
					runtimeRef.current.setModel(model);
				}
				return runtimeRef.current;
			}

			if (!model) {
				if (services.createRuntime) {
					const runtime = services.createRuntime(null);
					if (runtime) {
						runtimeRef.current = runtime;
						if (runtimeUnsubscribeRef.current === null) {
							runtimeUnsubscribeRef.current = runtime.subscribe(
								(event: AgentEvent) => {
									switch (event.type) {
										case "tool_execution_start": {
											const previous = toolExecutionsRef.current.get(
												event.toolCallId,
											);
											toolExecutionsRef.current.set(event.toolCallId, {
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
											toolExecutionsRef.current.set(event.toolCallId, {
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
											toolExecutionsRef.current.set(event.toolCallId, {
												toolCallId: event.toolCallId,
												toolName: event.toolName,
												args:
													toolExecutionsRef.current.get(event.toolCallId)
														?.args ?? {},
												status: event.isError ? "error" : "completed",
												result: event.result,
												isError: event.isError,
											});
											break;
										}

										case "message_end": {
											if (
												event.message.role === "assistant" &&
												(event.message.stopReason === "error" ||
													event.message.stopReason === "aborted")
											) {
												for (const [
													toolCallId,
													execution,
												] of toolExecutionsRef.current) {
													if (
														execution.status === "pending" ||
														execution.status === "running"
													) {
														toolExecutionsRef.current.set(toolCallId, {
															...execution,
															status: "error",
															isError: true,
															result: {
																content: [
																	{
																		type: "text",
																		text:
																			event.message.errorMessage ||
																			"Tool execution interrupted",
																	},
																],
																details: undefined,
															},
														});
													}
												}
											}
											break;
										}

										case "agent_end": {
											toolExecutionsRef.current.clear();
											break;
										}
									}

									syncRuntimeState();
								},
							);
						}
						return runtime;
					}
				}
				return null;
			}

			if (runtimeRef.current === null) {
				const runtime = new SuperskyAgentRuntime({
					authStorage: services.authStorage,
					model,
				});
				runtimeUnsubscribeRef.current = runtime.subscribe(
					(event: AgentEvent) => {
						switch (event.type) {
							case "tool_execution_start": {
								const previous = toolExecutionsRef.current.get(
									event.toolCallId,
								);
								toolExecutionsRef.current.set(event.toolCallId, {
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
								const previous = toolExecutionsRef.current.get(
									event.toolCallId,
								);
								toolExecutionsRef.current.set(event.toolCallId, {
									toolCallId: event.toolCallId,
									toolName: event.toolName,
									args: event.args,
									status: "running",
									result: event.partialResult,
									isError: false,
								});
								if (previous?.status === "pending") {
									const current = toolExecutionsRef.current.get(
										event.toolCallId,
									);
									if (!current) {
										break;
									}
									toolExecutionsRef.current.set(event.toolCallId, {
										...current,
										status: "running",
									});
								}
								break;
							}

							case "tool_execution_end": {
								toolExecutionsRef.current.set(event.toolCallId, {
									toolCallId: event.toolCallId,
									toolName: event.toolName,
									args:
										toolExecutionsRef.current.get(event.toolCallId)?.args ?? {},
									status: event.isError ? "error" : "completed",
									result: event.result,
									isError: event.isError,
								});
								break;
							}

							case "message_end": {
								if (
									event.message.role === "assistant" &&
									(event.message.stopReason === "error" ||
										event.message.stopReason === "aborted")
								) {
									for (const [
										toolCallId,
										execution,
									] of toolExecutionsRef.current) {
										if (
											execution.status === "pending" ||
											execution.status === "running"
										) {
											toolExecutionsRef.current.set(toolCallId, {
												...execution,
												status: "error",
												isError: true,
												result: {
													content: [
														{
															type: "text",
															text:
																event.message.errorMessage ||
																"Tool execution interrupted",
														},
													],
													details: undefined,
												},
											});
										}
									}
								}
								break;
							}

							case "agent_end": {
								toolExecutionsRef.current.clear();
								break;
							}
						}

						syncRuntimeState();
					},
				);
				runtimeRef.current = runtime;
			}

			runtimeRef.current.setModel(model);
			return runtimeRef.current;
		},
		[services, services.authStorage, syncRuntimeState],
	);

	useEffect(() => {
		if (activeModel) {
			ensureRuntime(activeModel);
		}
		syncRuntimeState();
	}, [activeModel, ensureRuntime, syncRuntimeState]);

	useEffect(() => {
		return () => {
			runtimeUnsubscribeRef.current?.();
			runtimeUnsubscribeRef.current = null;
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

	const selectModel = useCallback(
		(model: Model<Api>) => {
			services.settingsManager.setDefaultModelAndProvider(
				model.provider,
				model.id,
			);
			ensureRuntime(model)?.setModel(model);
			setActiveModel(model);
			setActivePicker(null);
			syncRuntimeState();
		},
		[ensureRuntime, services, syncRuntimeState],
	);

	const exitSession = useCallback(() => {
		setCommandNotice(null);
		destroyRendererAndExit(renderer);
	}, [renderer]);

	const resetSession = useCallback(() => {
		setCommandNotice(null);
		setActivePicker(null);
		runtimeRef.current?.abort();
		runtimeUnsubscribeRef.current?.();
		runtimeUnsubscribeRef.current = null;
		runtimeRef.current = null;
		toolExecutionsRef.current.clear();
		dispatch({ type: "sessionReset" });
		syncRuntimeState();
	}, [syncRuntimeState]);

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
					ensureRuntime(fallbackModel)?.setModel(fallbackModel);
				} else {
					runtimeRef.current?.abort();
					runtimeUnsubscribeRef.current?.();
					runtimeUnsubscribeRef.current = null;
					runtimeRef.current = null;
					syncRuntimeState();
				}
			}
			setActivePicker(null);
			setCommandNotice(`Logged out of ${providerName}`);
		},
		[ensureRuntime, services, syncRuntimeState],
	);

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

			const runtime = ensureRuntime(activeModelRef.current);
			if (!runtime) {
				setCommandNotice(
					"No model selected. Use /login or /model to choose a model.",
				);
				return;
			}

			dispatch({ type: "promptSubmitted" });

			if (runtime.agent.state.isStreaming) {
				runtime.agent.followUp({
					role: "user",
					content: [{ type: "text", text }],
					timestamp: Date.now(),
				});
				setCommandNotice("Queued message for the current session.");
				syncRuntimeState();
				return;
			}

			void runtime
				.prompt(text)
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
			ensureRuntime,
			exitSession,
			resetSession,
			selectModel,
			services,
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
		[cancelLoginDialog, exitSession, resetSession],
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
		[beginLoginFlow, logoutProvider, selectModel, services],
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
		activeModel,
		toolDefinitions: runtimeRef.current?.toolDefinitions ?? {},
		availableProviderCount: getAvailableProviderCount(services),
		commandPickerState,
		closeCommandPicker: closeActivePicker,
		selectCommandPickerItem,
		loginDialogState,
		setLoginDialogInputValue,
		submitLoginDialogInput,
		cancelLoginDialog,
	};
}
