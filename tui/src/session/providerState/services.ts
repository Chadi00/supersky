import type { AgentRuntimeLike } from "../../agent/runtime";
import type { AgentMessage } from "../../vendor/pi-agent-core/index.js";
import {
	type AssistantMessage,
	completeSimple,
} from "../../vendor/pi-ai/index.js";
import type { AuthStorageLike } from "./authStorage";
import { AuthStorage } from "./authStorage";
import type { ModelRegistryLike } from "./modelRegistry";
import { ModelRegistry } from "./modelRegistry";
import { getAuthPath, getSettingsPath, resolveWorkspaceRoot } from "./paths";
import type { Api, Model } from "./piSource";
import type { SessionStoreLike } from "./sessionStore";
import { SessionStore } from "./sessionStore";
import type { SettingsManagerLike } from "./settingsManager";
import { SettingsManager } from "./settingsManager";
import {
	createWorkspaceSnapshotStore,
	type WorkspaceSnapshotStoreLike,
} from "./workspaceSnapshotStore";

const DEFAULT_SESSION_TITLE = "New session";

function extractAssistantText(message: AssistantMessage) {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function sanitizeGeneratedSessionTitle(title: string) {
	const firstLine = title.trim().split(/\r?\n/, 1)[0] ?? "";
	const cleaned = firstLine
		.replace(/^title\s*:\s*/i, "")
		.replace(/^["'`]+|["'`]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned || cleaned === DEFAULT_SESSION_TITLE) {
		return null;
	}
	if (cleaned.length <= 48) {
		return cleaned;
	}
	const shortened = cleaned.slice(0, 48).trimEnd();
	const lastSpace = shortened.lastIndexOf(" ");
	return (lastSpace >= 24 ? shortened.slice(0, lastSpace) : shortened).trim();
}

async function generateSessionTitle(
	authStorage: AuthStorageLike,
	model: Model<Api>,
	input: { sessionId: string; firstMessage: string },
) {
	const apiKey = await authStorage.getApiKeyAsync(model.provider);
	const result = await completeSimple(
		model,
		{
			systemPrompt:
				"You write short session titles. Reply with only the title in 2 to 5 words. No quotes, no markdown, no trailing punctuation.",
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: input.firstMessage }],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey,
			cacheRetention: "none",
			maxTokens: 24,
			reasoning: "minimal",
			sessionId: `${input.sessionId}:title`,
		},
	);
	if (result.stopReason === "error" || result.stopReason === "aborted") {
		return null;
	}
	return sanitizeGeneratedSessionTitle(extractAssistantText(result));
}

export type SessionServices = {
	authStorage: AuthStorageLike;
	settingsManager: SettingsManagerLike;
	modelRegistry: ModelRegistryLike;
	sessionStore: SessionStoreLike;
	workspaceSnapshotStore: WorkspaceSnapshotStoreLike;
	workspaceRoot: string;
	createRuntime?: (
		model: Model<Api> | null,
		options?: {
			sessionId: string;
			initialMessages?: AgentMessage[];
		},
	) => AgentRuntimeLike | null;
	generateSessionTitle?: (input: {
		model: Model<Api>;
		sessionId: string;
		firstMessage: string;
	}) => Promise<string | null>;
	paths: {
		authPath: string;
		settingsPath: string;
	};
};

export function createSessionServices(): SessionServices {
	const authPath = getAuthPath();
	const settingsPath = getSettingsPath();
	const authStorage = new AuthStorage(authPath);
	const settingsManager = new SettingsManager(settingsPath);
	const modelRegistry = new ModelRegistry(authStorage);
	const workspaceRoot = resolveWorkspaceRoot();
	const sessionStore = new SessionStore(workspaceRoot);
	const workspaceSnapshotStore = createWorkspaceSnapshotStore({
		workspaceRoot,
	});

	return {
		authStorage,
		settingsManager,
		modelRegistry,
		sessionStore,
		workspaceSnapshotStore,
		workspaceRoot,
		generateSessionTitle: (input) =>
			generateSessionTitle(authStorage, input.model, {
				sessionId: input.sessionId,
				firstMessage: input.firstMessage,
			}),
		paths: {
			authPath,
			settingsPath,
		},
	};
}
