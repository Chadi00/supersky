import { getSettingsPath, readJsonFile, writeJsonFile } from "./paths";

type Settings = {
  defaultProvider?: string;
  defaultModel?: string;
};

export interface SettingsManagerLike {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
  setDefaultModelAndProvider(provider: string, modelId: string): void;
}

export class SettingsManager implements SettingsManagerLike {
  private settings: Settings;

  constructor(private settingsPath: string = getSettingsPath()) {
    this.settings = readJsonFile<Settings>(this.settingsPath, {});
  }

  private persist() {
    writeJsonFile(this.settingsPath, this.settings);
  }

  getDefaultProvider() {
    return this.settings.defaultProvider;
  }

  getDefaultModel() {
    return this.settings.defaultModel;
  }

  setDefaultModelAndProvider(provider: string, modelId: string) {
    this.settings.defaultProvider = provider;
    this.settings.defaultModel = modelId;
    this.persist();
  }
}
