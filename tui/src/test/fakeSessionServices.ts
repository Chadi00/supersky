import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertSuperskyAgentMessagesToLlm } from "../agent/bashExecutionTypes";
import type { AgentRuntimeLike } from "../agent/runtime";
import { buildSystemPrompt } from "../agent/systemPrompt";
import { createBuiltInTools } from "../agent/tools";
import type { EditorPreset } from "../app/editor";
import type {
	AuthCredential,
	AuthStorageLike,
} from "../session/providerState/authStorage";
import type { ModelRegistryLike } from "../session/providerState/modelRegistry";
import type {
	Api,
	Model,
	OAuthCredentials,
	OAuthLoginCallbacks,
	OAuthProviderId,
	OAuthProviderInterface,
} from "../session/providerState/piSource";
import type { SessionServices } from "../session/providerState/services";
import type {
	SessionPatch,
	SessionRevertState,
	SessionStoreLike,
	SessionSummary,
	StoredSession,
} from "../session/providerState/sessionStore";
import type { SettingsManagerLike } from "../session/providerState/settingsManager";
import { createWorkspaceSnapshotStore } from "../session/providerState/workspaceSnapshotStore";
import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import { Agent } from "../vendor/pi-agent-core/index.js";
import type { ThinkingLevel } from "../vendor/pi-agent-core/types.js";
import { createAssistantMessageEventStream } from "../vendor/pi-ai/index.js";

type FakeProviderSpec = {
	id: OAuthProviderId;
	name: string;
	usesCallbackServer?: boolean;
	loginMode: "instant" | "manual" | "prompt";
};

function createModel(provider: string, id: string, name: string): Model<Api> {
	return {
		id,
		name,
		api: "openai-responses",
		provider,
		baseUrl: "https://example.test",
		reasoning: true,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 200000,
		maxTokens: 16384,
	};
}

class FakeAgentRuntime implements AgentRuntimeLike {
	readonly cwd: string;
	readonly toolDefinitions: ReturnType<
		typeof createBuiltInTools
	>["definitions"];
	readonly agent: Agent;
	readonly sessionId: string;

	constructor(
		model: Model<Api>,
		cwd: string,
		sessionId: string,
		initialMessages: AgentMessage[] = [],
		thinkingLevel: ThinkingLevel = model.reasoning ? "medium" : "off",
	) {
		this.cwd = cwd;
		this.sessionId = sessionId;
		const tools = createBuiltInTools(cwd);
		this.toolDefinitions = tools.definitions;
		this.agent = new Agent({
			initialState: {
				systemPrompt: buildSystemPrompt({
					cwd,
					date: "2026-04-22",
					tools: Object.values(tools.definitions),
				}),
				model,
				messages: initialMessages,
				thinkingLevel,
				tools: tools.active,
			},
			convertToLlm: convertSuperskyAgentMessagesToLlm,
			sessionId,
			streamFn: async (runtimeModel, context) => {
				const stream = createAssistantMessageEventStream();
				const lastUserMessage = [...context.messages]
					.reverse()
					.find((message) => message.role === "user");
				const promptText = Array.isArray(lastUserMessage?.content)
					? lastUserMessage.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n")
					: typeof lastUserMessage?.content === "string"
						? lastUserMessage.content
						: "";
				queueMicrotask(() => {
					stream.push({
						type: "done",
						reason: "stop",
						message: {
							role: "assistant",
							content: [
								{
									type: "text",
									text: promptText ? "Handled request." : "Ready.",
								},
							],
							api: runtimeModel.api,
							provider: runtimeModel.provider,
							model: runtimeModel.id,
							usage: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 0,
								cost: {
									input: 0,
									output: 0,
									cacheRead: 0,
									cacheWrite: 0,
									total: 0,
								},
							},
							stopReason: "stop",
							timestamp: Date.now(),
						},
					});
				});
				return stream;
			},
		});
	}

	setModel(model: Model<Api>) {
		this.agent.state.model = model;
	}

	setThinkingLevel(level: ThinkingLevel) {
		this.agent.state.thinkingLevel = level;
	}

	reset() {
		this.agent.reset();
	}

	prompt(input: string | AgentMessage | AgentMessage[]) {
		if (typeof input === "string") {
			return this.agent.prompt(input);
		}

		return this.agent.prompt(input);
	}

	abort() {
		this.agent.abort();
	}

	subscribe(listener: Parameters<Agent["subscribe"]>[0]) {
		return this.agent.subscribe(listener);
	}
}

const fakeModels: Model<Api>[] = [
	createModel("anthropic", "claude-opus-4-6", "Claude Opus 4.6"),
	createModel("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5"),
	createModel("anthropic", "claude-haiku-4", "Claude Haiku 4"),
	createModel("github-copilot", "gpt-4o", "GPT-4o"),
	createModel("github-copilot", "gpt-5", "GPT-5"),
	createModel("google-gemini-cli", "gemini-2.5-pro", "Gemini 2.5 Pro"),
	createModel("google-gemini-cli", "gemini-2.5-flash", "Gemini 2.5 Flash"),
	createModel("google-gemini-cli", "gemini-2.0-flash", "Gemini 2.0 Flash"),
	createModel(
		"google-antigravity",
		"gemini-3.1-pro-high",
		"Gemini 3.1 Pro High",
	),
	createModel("google-antigravity", "claude-opus-4-6", "Claude Opus 4.6"),
	createModel("openai-codex", "gpt-5.4", "GPT-5.4"),
	createModel("openai-codex", "gpt-5.4-mini", "GPT-5.4 Mini"),
];

const defaultProviderSpecs: FakeProviderSpec[] = [
	{
		id: "anthropic",
		name: "Anthropic (Claude Pro/Max)",
		usesCallbackServer: true,
		loginMode: "instant",
	},
	{
		id: "github-copilot",
		name: "GitHub Copilot",
		loginMode: "instant",
	},
	{
		id: "google-gemini-cli",
		name: "Google Cloud Code Assist (Gemini CLI)",
		usesCallbackServer: true,
		loginMode: "instant",
	},
	{
		id: "google-antigravity",
		name: "Antigravity (Gemini 3, Claude, GPT-OSS)",
		usesCallbackServer: true,
		loginMode: "instant",
	},
	{
		id: "openai-codex",
		name: "ChatGPT Plus/Pro (Codex Subscription)",
		usesCallbackServer: true,
		loginMode: "manual",
	},
];

function createOAuthProvider(spec: FakeProviderSpec): OAuthProviderInterface {
	return {
		id: spec.id,
		name: spec.name,
		usesCallbackServer: spec.usesCallbackServer,
		async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
			callbacks.onAuth({
				url: `https://auth.example.test/${spec.id}`,
				instructions: `Authenticate ${spec.name}`,
			});

			if (spec.loginMode === "manual") {
				await callbacks.onManualCodeInput?.();
			}

			if (spec.loginMode === "prompt") {
				await callbacks.onPrompt({
					message: `Enter ${spec.name} organization`,
					placeholder: "my-team",
				});
			}

			callbacks.onProgress?.(`Connected to ${spec.name}`);

			return {
				access: `access-${spec.id}`,
				refresh: `refresh-${spec.id}`,
				expires: Date.now() + 60_000,
			};
		},
		async refreshToken(credentials: OAuthCredentials) {
			return credentials;
		},
		getApiKey(credentials: OAuthCredentials) {
			return credentials.access;
		},
	};
}

class FakeAuthStorage implements AuthStorageLike {
	private data: Record<string, AuthCredential> = {};
	private providers: OAuthProviderInterface[];

	constructor(providerSpecs: FakeProviderSpec[]) {
		this.providers = providerSpecs.map(createOAuthProvider);
	}

	get(provider: string) {
		return this.data[provider];
	}

	getApiKey(provider: string) {
		const credential = this.get(provider);
		if (credential?.type === "api_key") {
			return credential.key;
		}
		if (credential?.type === "oauth") {
			return this.providers
				.find((entry) => entry.id === provider)
				?.getApiKey(credential);
		}
		return undefined;
	}

	async getApiKeyAsync(provider: string) {
		return this.getApiKey(provider);
	}

	set(provider: string, credential: AuthCredential) {
		this.data[provider] = credential;
	}

	remove(provider: string) {
		delete this.data[provider];
	}

	has(provider: string) {
		return provider in this.data;
	}

	hasAuth(provider: string) {
		return this.has(provider);
	}

	async login(providerId: OAuthProviderId, callbacks: OAuthLoginCallbacks) {
		const provider = this.providers.find((entry) => entry.id === providerId);
		if (!provider) {
			throw new Error(`Unknown OAuth provider: ${providerId}`);
		}

		const credentials = await provider.login(callbacks);
		this.set(providerId, { type: "oauth", ...credentials });
	}

	logout(provider: string) {
		this.remove(provider);
	}

	getOAuthProviders() {
		return this.providers;
	}
}

class FakeSettingsManager implements SettingsManagerLike {
	private defaultProvider: string | undefined;
	private defaultModel: string | undefined;
	private defaultThinkingLevel: ThinkingLevel | undefined;
	private defaultEditor: EditorPreset | undefined;
	private customEditorCommand: string | undefined;

	getDefaultProvider() {
		return this.defaultProvider;
	}

	getDefaultModel() {
		return this.defaultModel;
	}

	getDefaultThinkingLevel() {
		return this.defaultThinkingLevel;
	}

	getDefaultEditor() {
		return this.defaultEditor;
	}

	getCustomEditorCommand() {
		return this.customEditorCommand;
	}

	setDefaultModelAndProvider(provider: string, modelId: string) {
		this.defaultProvider = provider;
		this.defaultModel = modelId;
	}

	setDefaultThinkingLevel(level: ThinkingLevel) {
		this.defaultThinkingLevel = level;
	}

	setDefaultEditor(editor: EditorPreset, customCommand?: string) {
		this.defaultEditor = editor;
		this.customEditorCommand = customCommand?.trim() || undefined;
	}
}

class FakeModelRegistry implements ModelRegistryLike {
	constructor(
		readonly authStorage: AuthStorageLike,
		private models: Model<Api>[],
	) {}

	refresh() {}

	getAll() {
		return this.models;
	}

	getAvailable() {
		return this.models.filter((model) => this.hasConfiguredAuth(model));
	}

	find(provider: string, modelId: string) {
		return this.models.find(
			(model) => model.provider === provider && model.id === modelId,
		);
	}

	hasConfiguredAuth(model: Model<Api>) {
		return this.authStorage.hasAuth(model.provider);
	}

	isUsingOAuth(model: Model<Api>) {
		return this.authStorage.get(model.provider)?.type === "oauth";
	}
}

class FakeSessionStore implements SessionStoreLike {
	private sessions = new Map<string, StoredSession>();
	private patches = new Map<string, SessionPatch[]>();
	private lastActiveSessionId: string | null = null;

	listSessions() {
		return [...this.sessions.values()]
			.map(
				(session): SessionSummary => ({
					id: session.id,
					title: session.title,
					createdAt: session.createdAt,
					updatedAt: session.updatedAt,
					modelProvider: session.modelProvider,
					modelId: session.modelId,
					workspaceRoot: session.workspaceRoot,
					parentSessionId: session.parentSessionId,
					thinkingLevel: session.thinkingLevel,
					revert: session.revert,
				}),
			)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getSession(sessionId: string) {
		return this.sessions.get(sessionId) ?? null;
	}

	createSession(input: {
		id: string;
		title: string;
		workspaceRoot: string;
		model: Model<Api> | null;
		thinkingLevel?: ThinkingLevel;
		parentSessionId?: string | null;
		createdAt?: number;
	}) {
		const now = input.createdAt ?? Date.now();
		const session: StoredSession = {
			id: input.id,
			title: input.title,
			createdAt: now,
			updatedAt: now,
			modelProvider: input.model?.provider ?? null,
			modelId: input.model?.id ?? null,
			workspaceRoot: input.workspaceRoot,
			parentSessionId: input.parentSessionId ?? null,
			thinkingLevel: input.thinkingLevel ?? "medium",
			revert: null,
			archivedMessages: [],
			messages: [],
		};
		this.sessions.set(input.id, session);
		return {
			id: session.id,
			title: session.title,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			modelProvider: session.modelProvider,
			modelId: session.modelId,
			workspaceRoot: session.workspaceRoot,
			parentSessionId: session.parentSessionId,
			thinkingLevel: session.thinkingLevel,
			revert: session.revert,
		};
	}

	updateSessionTitle(sessionId: string, title: string) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.title = title;
		session.updatedAt = Date.now();
	}

	updateSessionModel(sessionId: string, model: Model<Api> | null) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.modelProvider = model?.provider ?? null;
		session.modelId = model?.id ?? null;
		session.updatedAt = Date.now();
	}

	updateSessionThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.thinkingLevel = thinkingLevel;
		session.updatedAt = Date.now();
	}

	setSessionRevert(sessionId: string, revert: SessionRevertState | null) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.revert = revert;
		session.updatedAt = Date.now();
	}

	replaceSessionArchivedMessages(sessionId: string, messages: AgentMessage[]) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.archivedMessages = messages;
		session.updatedAt = Date.now();
	}

	replaceSessionMessages(sessionId: string, messages: AgentMessage[]) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.messages = messages;
		session.updatedAt = Date.now();
	}

	listSessionPatches(sessionId: string) {
		return [...(this.patches.get(sessionId) ?? [])];
	}

	replaceSessionPatches(sessionId: string, patches: SessionPatch[]) {
		this.patches.set(
			sessionId,
			patches.map((patch) => ({
				messageTimestamp: patch.messageTimestamp,
				snapshotId: patch.snapshotId,
				files: [...patch.files],
			})),
		);
		const session = this.sessions.get(sessionId);
		if (session) {
			session.updatedAt = Date.now();
		}
	}

	addSessionPatch(sessionId: string, patch: SessionPatch) {
		const patches = this.patches.get(sessionId) ?? [];
		patches.push({
			messageTimestamp: patch.messageTimestamp,
			snapshotId: patch.snapshotId,
			files: [...patch.files],
		});
		patches.sort(
			(left, right) => left.messageTimestamp - right.messageTimestamp,
		);
		this.patches.set(sessionId, patches);
		const session = this.sessions.get(sessionId);
		if (session) {
			session.updatedAt = Date.now();
		}
	}

	deleteSessionPatchesFrom(sessionId: string, messageTimestamp: number) {
		const patches = this.patches.get(sessionId);
		if (!patches) {
			return;
		}
		this.patches.set(
			sessionId,
			patches.filter((patch) => patch.messageTimestamp < messageTimestamp),
		);
		const session = this.sessions.get(sessionId);
		if (session) {
			session.updatedAt = Date.now();
		}
	}

	listReferencedSnapshotIds() {
		const snapshotIds = new Set<string>();
		for (const session of this.sessions.values()) {
			if (session.revert?.snapshotId) {
				snapshotIds.add(session.revert.snapshotId);
			}
		}
		for (const patches of this.patches.values()) {
			for (const patch of patches) {
				snapshotIds.add(patch.snapshotId);
			}
		}
		return [...snapshotIds];
	}

	deleteSession(sessionId: string) {
		this.sessions.delete(sessionId);
		this.patches.delete(sessionId);
		if (this.lastActiveSessionId === sessionId) {
			this.lastActiveSessionId = null;
		}
	}

	getLastActiveSessionId() {
		return this.lastActiveSessionId;
	}

	setLastActiveSessionId(sessionId: string | null) {
		this.lastActiveSessionId = sessionId;
	}
}

export function createFakeSessionServices(options?: {
	providerSpecs?: FakeProviderSpec[];
	models?: Model<Api>[];
	generateSessionTitle?: SessionServices["generateSessionTitle"];
	workspaceRoot?: string;
	snapshotsDir?: string;
}) {
	const authStorage = new FakeAuthStorage(
		options?.providerSpecs ?? defaultProviderSpecs,
	);
	const settingsManager = new FakeSettingsManager();
	const modelRegistry = new FakeModelRegistry(
		authStorage,
		options?.models ?? fakeModels,
	);
	const sessionStore = new FakeSessionStore();
	const workspaceRoot = options?.workspaceRoot ?? process.cwd();
	const workspaceSnapshotStore = createWorkspaceSnapshotStore({
		workspaceRoot,
		snapshotsDir:
			options?.snapshotsDir ??
			join(tmpdir(), `supersky-fake-snapshots-${randomUUID()}`),
	});

	return {
		authStorage,
		settingsManager,
		modelRegistry,
		sessionStore,
		workspaceSnapshotStore,
		workspaceRoot,
		createRuntime: (model, options) => {
			const fallbackModel = fakeModels[0];
			if (!fallbackModel) {
				return null;
			}
			return new FakeAgentRuntime(
				model ?? fallbackModel,
				workspaceRoot,
				options?.sessionId ?? `fake-session-${Date.now()}`,
				options?.initialMessages,
				options?.thinkingLevel,
			);
		},
		generateSessionTitle: options?.generateSessionTitle,
		paths: {
			authPath: "~/.supersky/agent/auth.json",
			settingsPath: "~/.supersky/agent/settings.json",
		},
	} satisfies SessionServices;
}
