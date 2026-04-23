import type { EditorPreset } from "../../app/editor";
import type { ThinkingLevel } from "../../vendor/pi-agent-core/types.js";
import { getSettingsPath, readJsonFile, writeJsonFile } from "./paths";

type Settings = {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: ThinkingLevel;
	defaultEditor?: EditorPreset;
	customEditorCommand?: string;
};

export interface SettingsManagerLike {
	getDefaultProvider(): string | undefined;
	getDefaultModel(): string | undefined;
	getDefaultThinkingLevel(): ThinkingLevel | undefined;
	getDefaultEditor(): EditorPreset | undefined;
	getCustomEditorCommand(): string | undefined;
	setDefaultModelAndProvider(provider: string, modelId: string): void;
	setDefaultThinkingLevel(level: ThinkingLevel): void;
	setDefaultEditor(editor: EditorPreset, customCommand?: string): void;
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

	getDefaultThinkingLevel() {
		return this.settings.defaultThinkingLevel;
	}

	getDefaultEditor() {
		return this.settings.defaultEditor;
	}

	getCustomEditorCommand() {
		return this.settings.customEditorCommand;
	}

	setDefaultModelAndProvider(provider: string, modelId: string) {
		this.settings.defaultProvider = provider;
		this.settings.defaultModel = modelId;
		this.persist();
	}

	setDefaultThinkingLevel(level: ThinkingLevel) {
		this.settings.defaultThinkingLevel = level;
		this.persist();
	}

	setDefaultEditor(editor: EditorPreset, customCommand?: string) {
		this.settings.defaultEditor = editor;
		this.settings.customEditorCommand = customCommand?.trim() || undefined;
		this.persist();
	}
}
