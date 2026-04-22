import type {
	AgentTool,
	AgentToolResult,
} from "../../vendor/pi-agent-core/index.js";
import type { Static, TSchema } from "../../vendor/pi-ai/index.js";

export interface SuperskyToolDefinition<
	TParameters extends TSchema = TSchema,
	TDetails = unknown,
> extends AgentTool<TParameters, TDetails> {
	icon: string;
	promptSnippet: string;
	promptGuidelines?: string[];
	formatCall(args: Static<TParameters>): string;
	formatResult?(result: AgentToolResult<TDetails>): string | undefined;
}
