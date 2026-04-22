import type { AuthStorageLike } from "./authStorage";
import { AuthStorage } from "./authStorage";
import type { ModelRegistryLike } from "./modelRegistry";
import { ModelRegistry } from "./modelRegistry";
import { getAuthPath, getSettingsPath } from "./paths";
import type { SettingsManagerLike } from "./settingsManager";
import { SettingsManager } from "./settingsManager";

export type SessionServices = {
  authStorage: AuthStorageLike;
  settingsManager: SettingsManagerLike;
  modelRegistry: ModelRegistryLike;
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

  return {
    authStorage,
    settingsManager,
    modelRegistry,
    paths: {
      authPath,
      settingsPath,
    },
  };
}
