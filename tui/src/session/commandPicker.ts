export type CommandPickerKind = "provider" | "model";

export type CommandPickerItem = {
  id: string;
  label: string;
  meta?: string;
};

export type CommandPickerState = {
  kind: CommandPickerKind;
  title: string;
  helperText?: string;
  filterText?: string;
  emptyText: string;
  selectedItemId?: string | null;
  items: CommandPickerItem[];
};

function sanitizeIdSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function getCommandPickerRowId(kind: CommandPickerKind, itemId: string) {
  return `command-picker-item-${kind}-${sanitizeIdSegment(itemId)}`;
}
