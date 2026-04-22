import type { Api, KnownProvider, Model } from "./types";

export function getProviders(): KnownProvider[];
export function getModels(provider: string): Model<Api>[];
export function modelsAreEqual(
  left: Model<Api> | null | undefined,
  right: Model<Api> | null | undefined,
): boolean;
