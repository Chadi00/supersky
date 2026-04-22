import type { AgentRuntimeLike } from "../../agent/runtime";
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

export type SessionServices = {
	authStorage: AuthStorageLike;
	settingsManager: SettingsManagerLike;
	modelRegistry: ModelRegistryLike;
	sessionStore: SessionStoreLike;
	workspaceRoot: string;
	createRuntime?: (model: Model<Api> | null) => AgentRuntimeLike | null;
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

	return {
		authStorage,
		settingsManager,
		modelRegistry,
		sessionStore,
		workspaceRoot,
		paths: {
			authPath,
			settingsPath,
		},
	};
}
