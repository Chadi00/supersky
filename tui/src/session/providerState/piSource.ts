import * as envApiKeysRuntime from "../../vendor/pi-ai/env-api-keys.js";
import * as modelsRuntime from "../../vendor/pi-ai/models.js";
import type {
  Api,
  KnownProvider,
  Model,
  OAuthCredentials,
  OAuthLoginCallbacks,
  OAuthProviderId,
  OAuthProviderInterface,
} from "../../vendor/pi-ai/types";
import * as oauthRuntime from "../../vendor/pi-ai/utils/oauth/index.js";

export type {
  Api,
  KnownProvider,
  Model,
  OAuthCredentials,
  OAuthLoginCallbacks,
  OAuthProviderId,
  OAuthProviderInterface,
};

export function getEnvApiKey(provider: string) {
  return envApiKeysRuntime.getEnvApiKey(provider) as string | undefined;
}

export function getProviders() {
  return modelsRuntime.getProviders() as KnownProvider[];
}

export function getModels(provider: string) {
  return modelsRuntime.getModels(provider) as Model<Api>[];
}

export function modelsAreEqual(
  left: Model<Api> | null | undefined,
  right: Model<Api> | null | undefined,
) {
  return modelsRuntime.modelsAreEqual(left, right) as boolean;
}

export function getOAuthProvider(id: string) {
  return oauthRuntime.getOAuthProvider(id) as
    | OAuthProviderInterface
    | undefined;
}

export function getOAuthProviders() {
  return oauthRuntime.getOAuthProviders() as OAuthProviderInterface[];
}
