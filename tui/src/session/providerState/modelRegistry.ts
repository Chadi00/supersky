import type { AuthStorageLike, OAuthCredential } from "./authStorage";
import { type Api, getModels, getProviders, type Model } from "./piSource";

export interface ModelRegistryLike {
  readonly authStorage: AuthStorageLike;
  refresh(): void;
  getAll(): Model<Api>[];
  getAvailable(): Model<Api>[];
  find(provider: string, modelId: string): Model<Api> | undefined;
  hasConfiguredAuth(model: Model<Api>): boolean;
}

export class ModelRegistry implements ModelRegistryLike {
  private models: Model<Api>[] = [];

  constructor(readonly authStorage: AuthStorageLike) {
    this.refresh();
  }

  refresh() {
    let nextModels = getProviders().flatMap((provider) =>
      getModels(provider).map((model) => model as Model<Api>),
    );

    for (const oauthProvider of this.authStorage.getOAuthProviders()) {
      const credential = this.authStorage.get(oauthProvider.id);
      if (credential?.type === "oauth" && oauthProvider.modifyModels) {
        nextModels = oauthProvider.modifyModels(
          nextModels,
          credential as OAuthCredential,
        );
      }
    }

    this.models = nextModels;
  }

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
}
