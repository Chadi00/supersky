import type { AgentTool } from "../../vendor/pi-agent-core/index.js";
import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";

export const defaultToolNames = ["read", "bash", "edit", "write"] as const;

export function createBuiltInTools(cwd: string) {
	const tools = {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
	};

	return {
		definitions: tools,
		active: defaultToolNames.map((name) => tools[name]) as AgentTool[],
	};
}

export type BuiltInToolDefinitions = ReturnType<
	typeof createBuiltInTools
>["definitions"];
