import type { ModelRegistryLike } from "./modelRegistry";
import type { Api, KnownProvider, Model } from "./piSource";

export const defaultModelPerProvider: Record<KnownProvider, string> = {
  "amazon-bedrock": "us.anthropic.claude-opus-4-6-v1",
  anthropic: "claude-opus-4-6",
  openai: "gpt-5.4",
  "azure-openai-responses": "gpt-5.2",
  "openai-codex": "gpt-5.4",
  google: "gemini-2.5-pro",
  "google-gemini-cli": "gemini-2.5-pro",
  "google-antigravity": "gemini-3.1-pro-high",
  "google-vertex": "gemini-3-pro-preview",
  "github-copilot": "gpt-4o",
  openrouter: "openai/gpt-5.1-codex",
  "vercel-ai-gateway": "anthropic/claude-opus-4-6",
  xai: "grok-4-fast-non-reasoning",
  groq: "openai/gpt-oss-120b",
  cerebras: "zai-glm-4.7",
  zai: "glm-5",
  mistral: "devstral-medium-latest",
  minimax: "MiniMax-M2.7",
  "minimax-cn": "MiniMax-M2.7",
  huggingface: "moonshotai/Kimi-K2.5",
  opencode: "claude-opus-4-6",
  "opencode-go": "kimi-k2.5",
  "kimi-coding": "kimi-for-coding",
};

export function hasDefaultModelProvider(provider: string) {
  return provider in defaultModelPerProvider;
}

export function findExactModelReferenceMatch(
  modelReference: string,
  availableModels: Model<Api>[],
): Model<Api> | undefined {
  const trimmedReference = modelReference.trim();
  if (!trimmedReference) {
    return undefined;
  }

  const normalizedReference = trimmedReference.toLowerCase();

  const canonicalMatches = availableModels.filter(
    (model) =>
      `${model.provider}/${model.id}`.toLowerCase() === normalizedReference,
  );
  if (canonicalMatches.length === 1) {
    return canonicalMatches[0];
  }
  if (canonicalMatches.length > 1) {
    return undefined;
  }

  const slashIndex = trimmedReference.indexOf("/");
  if (slashIndex !== -1) {
    const provider = trimmedReference.substring(0, slashIndex).trim();
    const modelId = trimmedReference.substring(slashIndex + 1).trim();
    if (provider && modelId) {
      const providerMatches = availableModels.filter(
        (model) =>
          model.provider.toLowerCase() === provider.toLowerCase() &&
          model.id.toLowerCase() === modelId.toLowerCase(),
      );
      if (providerMatches.length === 1) {
        return providerMatches[0];
      }
      if (providerMatches.length > 1) {
        return undefined;
      }
    }
  }

  const idMatches = availableModels.filter(
    (model) => model.id.toLowerCase() === normalizedReference,
  );
  return idMatches.length === 1 ? idMatches[0] : undefined;
}

export function findInitialModel(options: {
  defaultProvider: string | undefined;
  defaultModelId: string | undefined;
  modelRegistry: ModelRegistryLike;
}) {
  const { defaultProvider, defaultModelId, modelRegistry } = options;

  if (defaultProvider && defaultModelId) {
    const found = modelRegistry.find(defaultProvider, defaultModelId);
    if (found && modelRegistry.hasConfiguredAuth(found)) {
      return found;
    }
  }

  const availableModels = modelRegistry.getAvailable();
  if (availableModels.length === 0) {
    return undefined;
  }

  for (const provider of Object.keys(
    defaultModelPerProvider,
  ) as KnownProvider[]) {
    const defaultId = defaultModelPerProvider[provider];
    const match = availableModels.find(
      (model) => model.provider === provider && model.id === defaultId,
    );
    if (match) {
      return match;
    }
  }

  return availableModels[0];
}
