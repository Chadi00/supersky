import { getAuthPath, readJsonFile, writeJsonFile } from "./paths";
import {
	getEnvApiKey,
	getOAuthProvider,
	getOAuthProviders,
	type OAuthCredentials,
	type OAuthLoginCallbacks,
	type OAuthProviderId,
	type OAuthProviderInterface,
} from "./piSource";

export type ApiKeyCredential = {
	type: "api_key";
	key: string;
};

export type OAuthCredential = {
	type: "oauth";
} & OAuthCredentials;

export type AuthCredential = ApiKeyCredential | OAuthCredential;

type AuthStorageData = Record<string, AuthCredential>;

export interface AuthStorageLike {
	get(provider: string): AuthCredential | undefined;
	getApiKey(provider: string): string | undefined;
	getApiKeyAsync(provider: string): Promise<string | undefined>;
	set(provider: string, credential: AuthCredential): void;
	remove(provider: string): void;
	has(provider: string): boolean;
	hasAuth(provider: string): boolean;
	login(
		providerId: OAuthProviderId,
		callbacks: OAuthLoginCallbacks,
	): Promise<void>;
	logout(provider: string): void;
	getOAuthProviders(): OAuthProviderInterface[];
}

export class AuthStorage implements AuthStorageLike {
	private data: AuthStorageData;

	constructor(private authPath: string = getAuthPath()) {
		this.data = readJsonFile<AuthStorageData>(this.authPath, {});
	}

	private persist() {
		writeJsonFile(this.authPath, this.data);
	}

	get(provider: string) {
		return this.data[provider] ?? undefined;
	}

	getApiKey(provider: string) {
		const credential = this.get(provider);
		if (credential?.type === "api_key") {
			return credential.key;
		}
		if (credential?.type === "oauth") {
			return getOAuthProvider(provider)?.getApiKey(credential);
		}
		return getEnvApiKey(provider);
	}

	async getApiKeyAsync(provider: string) {
		const credential = this.get(provider);
		if (credential?.type === "api_key") {
			return credential.key;
		}
		if (credential?.type === "oauth") {
			const oauthProvider = getOAuthProvider(provider);
			if (!oauthProvider) {
				return undefined;
			}
			let nextCredential = credential;
			if (Date.now() >= credential.expires) {
				nextCredential = {
					type: "oauth",
					...(await oauthProvider.refreshToken(credential)),
				};
				this.set(provider, nextCredential);
			}
			return oauthProvider.getApiKey(nextCredential);
		}
		return getEnvApiKey(provider);
	}

	set(provider: string, credential: AuthCredential) {
		this.data[provider] = credential;
		this.persist();
	}

	remove(provider: string) {
		delete this.data[provider];
		this.persist();
	}

	has(provider: string) {
		return provider in this.data;
	}

	hasAuth(provider: string) {
		return this.has(provider) || getEnvApiKey(provider) !== undefined;
	}

	async login(providerId: OAuthProviderId, callbacks: OAuthLoginCallbacks) {
		const provider = getOAuthProvider(providerId);
		if (!provider) {
			throw new Error(`Unknown OAuth provider: ${providerId}`);
		}

		const credentials = await provider.login(callbacks);
		this.set(providerId, { type: "oauth", ...credentials });
	}

	logout(provider: string) {
		this.remove(provider);
	}

	getOAuthProviders() {
		return getOAuthProviders();
	}
}
