import type { AuthStorageLike } from "../session/providerState/authStorage";
import {
	Agent,
	type AgentEvent,
	type AgentMessage,
} from "../vendor/pi-agent-core/index.js";
import { type Api, type Model, streamSimple } from "../vendor/pi-ai/index.js";
import { convertSuperskyAgentMessagesToLlm } from "./bashExecutionTypes.js";
import { buildSystemPrompt } from "./systemPrompt";
import {
	type BuiltInToolDefinitions,
	createBuiltInTools,
	defaultToolNames,
} from "./tools";

export type AgentRuntimeOptions = {
	authStorage: AuthStorageLike;
	cwd?: string;
	model: Model<Api>;
	sessionId: string;
	initialMessages?: AgentMessage[];
};

export interface AgentRuntimeLike {
	readonly agent: Agent;
	readonly sessionId: string;
	readonly cwd: string;
	readonly toolDefinitions: BuiltInToolDefinitions;
	setModel(model: Model<Api>): void;
	reset(): void;
	prompt(input: string | AgentMessage | AgentMessage[]): Promise<void>;
	abort(): void;
	subscribe(
		listener: (event: AgentEvent, signal: AbortSignal) => void | Promise<void>,
	): () => void;
}

function formatCurrentDate(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export class SuperskyAgentRuntime implements AgentRuntimeLike {
	readonly agent: Agent;
	readonly cwd: string;
	readonly sessionId: string;
	readonly toolDefinitions: BuiltInToolDefinitions;

	constructor(private options: AgentRuntimeOptions) {
		this.cwd = options.cwd ?? process.cwd();
		this.sessionId = options.sessionId;
		const tools = createBuiltInTools(this.cwd);
		this.toolDefinitions = tools.definitions;
		this.agent = new Agent({
			initialState: {
				systemPrompt: buildSystemPrompt({
					cwd: this.cwd,
					date: formatCurrentDate(new Date()),
					tools: defaultToolNames.map((name) => tools.definitions[name]),
				}),
				model: options.model,
				messages: options.initialMessages ?? [],
				thinkingLevel: options.model.reasoning ? "medium" : "off",
				tools: tools.active,
			},
			convertToLlm: convertSuperskyAgentMessagesToLlm,
			streamFn: async (model, context, streamOptions) => {
				const apiKey = await this.options.authStorage.getApiKeyAsync(
					model.provider,
				);
				return streamSimple(model, context, {
					...streamOptions,
					apiKey,
				});
			},
			sessionId: this.sessionId,
			toolExecution: "parallel",
		});
	}

	setModel(model: Model<Api>) {
		this.agent.state.model = model;
		if (!model.reasoning) {
			this.agent.state.thinkingLevel = "off";
		} else if (this.agent.state.thinkingLevel === "off") {
			this.agent.state.thinkingLevel = "medium";
		}
	}

	reset() {
		this.agent.reset();
	}

	prompt(input: string | AgentMessage | AgentMessage[]) {
		if (typeof input === "string") {
			return this.agent.prompt(input);
		}

		return this.agent.prompt(input);
	}

	abort() {
		this.agent.abort();
	}

	subscribe(
		listener: (event: AgentEvent, signal: AbortSignal) => void | Promise<void>,
	) {
		return this.agent.subscribe(listener);
	}
}
