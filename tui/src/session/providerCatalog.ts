export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "copilot";

export type ProviderModel = {
  id: string;
  name: string;
};

export type ProviderOption = {
  id: ProviderId;
  name: string;
  defaultModelId: string;
  models: ProviderModel[];
};

const providerCatalog: readonly ProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude Pro/Max)",
    defaultModelId: "claude-opus-4.6",
    models: [
      { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4", name: "Claude Haiku 4" },
    ],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    defaultModelId: "copilot-gpt-4.1",
    models: [
      { id: "copilot-gpt-4.1", name: "GPT-4.1" },
      { id: "copilot-gpt-4o", name: "GPT-4o" },
      { id: "copilot-gpt-5", name: "GPT-5" },
    ],
  },
  {
    id: "google",
    name: "Google Cloud Code Assist (Gemini CLI)",
    defaultModelId: "gemini-2.5-pro",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "openrouter",
    name: "Antigravity (Gemini 3, Claude, GPT-OSS)",
    defaultModelId: "openai-gpt-5.1-codex",
    models: [
      { id: "openai-gpt-5.1-codex", name: "OpenAI GPT-5.1 Codex" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
      { id: "kimi-k2.5", name: "Kimi K2.5" },
    ],
  },
  {
    id: "openai",
    name: "ChatGPT Plus/Pro (Codex Subscription)",
    defaultModelId: "gpt-5.4",
    models: [
      { id: "gpt-5.1", name: "gpt-5.1" },
      { id: "gpt-5.1-codex-max", name: "gpt-5.1-codex-max" },
      { id: "gpt-5.1-codex-mini", name: "gpt-5.1-codex-mini" },
      { id: "gpt-5.2", name: "gpt-5.2" },
      { id: "gpt-5.2-codex", name: "gpt-5.2-codex" },
      { id: "gpt-5.3-codex", name: "gpt-5.3-codex" },
      { id: "gpt-5.3-codex-spark", name: "gpt-5.3-codex-spark" },
      { id: "gpt-5.4", name: "gpt-5.4" },
      { id: "gpt-5.4-mini", name: "gpt-5.4-mini" },
    ],
  },
] as const;

type RankedProviderModel = {
  model: ProviderModel;
  index: number;
  prefixMatch: boolean;
};

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function getRankedModels(providerId: ProviderId, query: string) {
  const normalizedQuery = normalizeQuery(query);
  const models = getProviderModels(providerId);
  if (!normalizedQuery) {
    return models.map((model, index) => ({
      model,
      index,
      prefixMatch: true,
    }));
  }

  return models
    .map((model, index) => {
      const normalizedId = model.id.toLowerCase();
      const normalizedName = model.name.toLowerCase();
      const prefixMatch =
        normalizedId.startsWith(normalizedQuery) ||
        normalizedName.startsWith(normalizedQuery);
      const includesMatch =
        prefixMatch ||
        normalizedId.includes(normalizedQuery) ||
        normalizedName.includes(normalizedQuery);

      if (!includesMatch) {
        return null;
      }

      return {
        model,
        index,
        prefixMatch,
      } satisfies RankedProviderModel;
    })
    .filter((entry): entry is RankedProviderModel => entry !== null)
    .sort((left, right) => {
      if (left.prefixMatch !== right.prefixMatch) {
        return left.prefixMatch ? -1 : 1;
      }

      return left.index - right.index;
    });
}

export function getProviderOptions() {
  return providerCatalog;
}

export function findProviderOption(providerId: string) {
  return providerCatalog.find((provider) => provider.id === providerId) ?? null;
}

export function getProviderModels(providerId: ProviderId) {
  return findProviderOption(providerId)?.models ?? [];
}

export function findProviderModel(providerId: ProviderId, modelId: string) {
  return (
    getProviderModels(providerId).find((model) => model.id === modelId) ?? null
  );
}

export function getDefaultProviderModel(providerId: ProviderId) {
  const provider = findProviderOption(providerId);
  if (!provider) {
    return null;
  }

  return findProviderModel(providerId, provider.defaultModelId);
}

export function getMatchingProviderModels(
  providerId: ProviderId,
  query: string,
) {
  return getRankedModels(providerId, query).map((entry) => entry.model);
}

export function findExactProviderModelMatch(
  providerId: ProviderId,
  modelReference: string,
) {
  const normalizedReference = normalizeQuery(modelReference);
  if (!normalizedReference) {
    return null;
  }

  const exactMatches = getProviderModels(providerId).filter((model) => {
    const normalizedId = model.id.toLowerCase();
    const normalizedName = model.name.toLowerCase();

    return (
      normalizedId === normalizedReference ||
      normalizedName === normalizedReference
    );
  });

  return exactMatches[0] ?? null;
}
