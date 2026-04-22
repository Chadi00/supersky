export type CommandPickerKind = "provider" | "model" | "sessions";

export type InlineCommandPickerKind = Exclude<CommandPickerKind, "sessions">;

export type InlineCommandPickerItem = {
	id: string;
	prefix?: string;
	label: string;
	meta?: string;
};

export type SessionPickerItem = {
	id: string;
	label: string;
	updatedAt: number;
	isCurrent?: boolean;
	isStreaming?: boolean;
	isDeletePending?: boolean;
};

export type CommandPickerFooterAction = {
	label: string;
	shortcut: string;
};

type BaseCommandPickerState = {
	title: string;
	helperText?: string;
	footerActions?: CommandPickerFooterAction[];
	filterText?: string;
	emptyText: string;
	selectedItemId?: string | null;
};

export type InlineCommandPickerState = BaseCommandPickerState & {
	kind: InlineCommandPickerKind;
	items: InlineCommandPickerItem[];
};

export type SessionCommandPickerState = BaseCommandPickerState & {
	kind: "sessions";
	pendingDeleteItemId?: string | null;
	items: SessionPickerItem[];
};

export type CommandPickerState =
	| InlineCommandPickerState
	| SessionCommandPickerState;

function sanitizeIdSegment(segment: string) {
	return segment.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function getCommandPickerRowId(kind: CommandPickerKind, itemId: string) {
	return `command-picker-item-${kind}-${sanitizeIdSegment(itemId)}`;
}
