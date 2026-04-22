import type {
  OAuthCredentials,
  OAuthProviderId,
  OAuthProviderInterface,
} from "../../types";

export function getOAuthProvider(
  id: OAuthProviderId,
): OAuthProviderInterface | undefined;

export function getOAuthProviders(): OAuthProviderInterface[];

export function getOAuthApiKey(
  providerId: OAuthProviderId,
  credentials: Record<string, OAuthCredentials>,
): Promise<{ newCredentials: OAuthCredentials; apiKey: string } | null>;
