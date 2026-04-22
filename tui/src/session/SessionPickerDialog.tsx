import type { ScrollBoxRenderable } from "@opentui/core";
import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BRAILLE_SPINNER_FRAMES } from "../shared/brailleSpinner";
import {
	getCommandPickerRowId,
	type SessionCommandPickerState,
} from "./commandPicker";

const DIALOG_WIDTH = 88;
const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 150);
const SESSION_PANEL_BACKGROUND = "#141414";
const SESSION_TEXT = "#eeeeee";
const SESSION_MUTED_TEXT = "#808080";
const SESSION_CATEGORY_TEXT = "#9d7cd8";
const SESSION_SELECTED_BACKGROUND = "#fab283";
const SESSION_SELECTED_TEXT = "#0a0a0a";
const SESSION_ERROR_BACKGROUND = "#e06c75";

type SessionPickerDialogProps = {
	state: SessionCommandPickerState;
	onClose: () => void;
	onSelect: (sessionId: string) => void;
	onRename: (sessionId: string) => void;
	onCopy: (sessionId: string) => void;
	onDelete: (sessionId: string) => void;
	onClearPendingDelete: () => void;
};

type SessionGroup = {
	category: string;
	items: SessionCommandPickerState["items"];
};

function normalizeQuery(value: string) {
	return value.trim().toLowerCase();
}

function formatSessionCategory(timestamp: number) {
	const date = new Date(timestamp);
	const now = new Date();
	if (
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()
	) {
		return "Today";
	}

	return date.toDateString();
}

function formatSessionTime(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(timestamp));
}

function filterSessionItems(
	items: SessionCommandPickerState["items"],
	query: string,
) {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) {
		return items;
	}

	return items
		.map((item, index) => {
			const normalizedTitle = item.label.toLowerCase();
			const normalizedId = item.id.toLowerCase();
			const prefixMatch =
				normalizedTitle.startsWith(normalizedQuery) ||
				normalizedId.startsWith(normalizedQuery);
			const includesMatch =
				prefixMatch ||
				normalizedTitle.includes(normalizedQuery) ||
				normalizedId.includes(normalizedQuery);

			if (!includesMatch) {
				return null;
			}

			return { item, index, prefixMatch };
		})
		.filter(
			(
				entry,
			): entry is {
				item: SessionCommandPickerState["items"][number];
				index: number;
				prefixMatch: boolean;
			} => entry !== null,
		)
		.sort((left, right) => {
			if (left.prefixMatch !== right.prefixMatch) {
				return left.prefixMatch ? -1 : 1;
			}

			return left.index - right.index;
		})
		.map((entry) => entry.item);
}

function groupSessionItems(
	items: SessionCommandPickerState["items"],
): SessionGroup[] {
	const groups: SessionGroup[] = [];
	const seen = new Map<string, SessionGroup>();

	for (const item of items) {
		const category = formatSessionCategory(item.updatedAt);
		const existing = seen.get(category);
		if (existing) {
			existing.items.push(item);
			continue;
		}

		const nextGroup = { category, items: [item] };
		seen.set(category, nextGroup);
		groups.push(nextGroup);
	}

	return groups;
}

function countVisibleRows(groups: SessionGroup[]) {
	return groups.reduce((count, group, index) => {
		const headerRows = group.category ? 1 : 0;
		const spacerRows = index > 0 && group.category ? 1 : 0;
		return count + spacerRows + headerRows + group.items.length;
	}, 0);
}

export function SessionPickerDialog({
	state,
	onClose,
	onSelect,
	onRename,
	onCopy,
	onDelete,
	onClearPendingDelete,
}: SessionPickerDialogProps) {
	const { width, height } = useTerminalDimensions();
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [spinnerFrameIndex, setSpinnerFrameIndex] = useState(0);

	const filteredItems = useMemo(
		() => filterSessionItems(state.items, query),
		[state.items, query],
	);
	const groupedItems = useMemo(
		() => groupSessionItems(filteredItems),
		[filteredItems],
	);
	const visibleRowCount = useMemo(() => {
		const rows = countVisibleRows(groupedItems);
		const maxVisibleRows = Math.max(4, Math.floor(height / 2) - 6);
		return Math.max(1, Math.min(rows || 1, maxVisibleRows));
	}, [groupedItems, height]);
	const selectedItem = filteredItems[selectedIndex] ?? filteredItems[0] ?? null;
	const dialogWidth = Math.max(56, Math.min(DIALOG_WIDTH, width - 2));

	useEffect(() => {
		const hasStreamingItem = state.items.some((item) => item.isStreaming);
		if (!hasStreamingItem) {
			return;
		}

		const id = setInterval(() => {
			setSpinnerFrameIndex(
				(current) => (current + 1) % BRAILLE_SPINNER_FRAMES.length,
			);
		}, 80);
		return () => clearInterval(id);
	}, [state.items]);

	useEffect(() => {
		if (filteredItems.length === 0) {
			setSelectedIndex(0);
			return;
		}

		if (normalizeQuery(query)) {
			setSelectedIndex(0);
			return;
		}

		const currentIndex = filteredItems.findIndex(
			(item) => item.id === state.selectedItemId,
		);
		setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
	}, [filteredItems, query, state.selectedItemId]);

	useEffect(() => {
		if (
			state.pendingDeleteItemId &&
			selectedItem?.id !== state.pendingDeleteItemId
		) {
			onClearPendingDelete();
		}
	}, [onClearPendingDelete, selectedItem?.id, state.pendingDeleteItemId]);

	useEffect(() => {
		if (!selectedItem) {
			return;
		}

		scrollboxRef.current?.scrollChildIntoView(
			getCommandPickerRowId("sessions", selectedItem.id),
		);
	}, [selectedItem]);

	const moveSelection = (direction: number) => {
		if (filteredItems.length === 0) {
			setSelectedIndex(0);
			return;
		}

		setSelectedIndex((currentIndex) => {
			const nextIndex = currentIndex + direction;
			if (nextIndex < 0) {
				return filteredItems.length - 1;
			}
			if (nextIndex >= filteredItems.length) {
				return 0;
			}
			return nextIndex;
		});
	};

	const moveSelectionTo = (nextIndex: number) => {
		if (filteredItems.length === 0) {
			setSelectedIndex(0);
			return;
		}

		setSelectedIndex(
			Math.max(0, Math.min(filteredItems.length - 1, nextIndex)),
		);
	};

	useKeyboard((key) => {
		if (key.defaultPrevented) {
			return;
		}

		if (key.name === "escape") {
			key.preventDefault();
			key.stopPropagation();
			onClose();
			return;
		}

		if (key.ctrl && key.name === "r") {
			if (!selectedItem) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			onRename(selectedItem.id);
			return;
		}

		if (key.ctrl && key.name === "d") {
			if (!selectedItem) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			onDelete(selectedItem.id);
			return;
		}

		if (key.ctrl && key.name === "k") {
			if (!selectedItem) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			onCopy(selectedItem.id);
			return;
		}

		if (key.name === "up" || (key.ctrl && key.name === "p")) {
			key.preventDefault();
			key.stopPropagation();
			moveSelection(-1);
			return;
		}

		if (key.name === "down" || (key.ctrl && key.name === "n")) {
			key.preventDefault();
			key.stopPropagation();
			moveSelection(1);
			return;
		}

		if (key.name === "pageup") {
			key.preventDefault();
			key.stopPropagation();
			moveSelection(-10);
			return;
		}

		if (key.name === "pagedown") {
			key.preventDefault();
			key.stopPropagation();
			moveSelection(10);
			return;
		}

		if (key.name === "home") {
			key.preventDefault();
			key.stopPropagation();
			moveSelectionTo(0);
			return;
		}

		if (key.name === "end") {
			key.preventDefault();
			key.stopPropagation();
			moveSelectionTo(filteredItems.length - 1);
		}
	});

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			zIndex={220}
			justifyContent="center"
			alignItems="center"
			backgroundColor={OVERLAY_BACKGROUND}
		>
			<box
				width={dialogWidth}
				maxWidth={Math.max(1, width - 2)}
				maxHeight={Math.max(12, height - 4)}
				flexDirection="column"
				backgroundColor={SESSION_PANEL_BACKGROUND}
				paddingTop={1}
			>
				<box flexDirection="column" gap={1} paddingBottom={1}>
					<box paddingLeft={4} paddingRight={4}>
						<box flexDirection="row" justifyContent="space-between">
							<text fg={SESSION_TEXT} attributes={TextAttributes.BOLD}>
								{state.title}
							</text>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI text is the clickable close affordance here. */}
							<text
								fg={SESSION_MUTED_TEXT}
								onMouseUp={() => {
									onClose();
								}}
							>
								esc
							</text>
						</box>
						<box paddingTop={1}>
							<input
								value={query}
								placeholder="Search"
								focused
								onInput={setQuery}
								onChange={setQuery}
								onSubmit={() => {
									if (!selectedItem) {
										return;
									}
									onSelect(selectedItem.id);
								}}
								backgroundColor={SESSION_PANEL_BACKGROUND}
								textColor={SESSION_MUTED_TEXT}
								focusedBackgroundColor={SESSION_PANEL_BACKGROUND}
								focusedTextColor={SESSION_MUTED_TEXT}
								placeholderColor={SESSION_MUTED_TEXT}
							/>
						</box>
					</box>
					{groupedItems.length > 0 ? (
						<scrollbox
							key={`${query}\u0000${filteredItems.map((item) => item.id).join("\u0000")}`}
							ref={scrollboxRef}
							height={visibleRowCount}
							focused={false}
							scrollX={false}
							style={{
								rootOptions: { backgroundColor: SESSION_PANEL_BACKGROUND },
								wrapperOptions: { backgroundColor: SESSION_PANEL_BACKGROUND },
								viewportOptions: { backgroundColor: SESSION_PANEL_BACKGROUND },
								contentOptions: { backgroundColor: SESSION_PANEL_BACKGROUND },
								scrollbarOptions: { visible: false },
								verticalScrollbarOptions: { visible: false },
								horizontalScrollbarOptions: { visible: false },
							}}
						>
							<box flexDirection="column" paddingLeft={1} paddingRight={1}>
								{groupedItems.map((group, groupIndex) => (
									<box key={group.category} flexDirection="column">
										<box paddingTop={groupIndex > 0 ? 1 : 0} paddingLeft={3}>
											<text
												fg={SESSION_CATEGORY_TEXT}
												attributes={TextAttributes.BOLD}
											>
												{group.category}
											</text>
										</box>
										{group.items.map((item) => {
											const itemIndex = filteredItems.findIndex(
												(entry) => entry.id === item.id,
											);
											const isSelected = itemIndex === selectedIndex;
											const rowBackground = isSelected
												? item.isDeletePending
													? SESSION_ERROR_BACKGROUND
													: SESSION_SELECTED_BACKGROUND
												: SESSION_PANEL_BACKGROUND;
											const rowForeground = isSelected
												? SESSION_SELECTED_TEXT
												: item.isCurrent
													? SESSION_SELECTED_BACKGROUND
													: SESSION_TEXT;
											const marker = item.isCurrent
												? "●"
												: item.isStreaming
													? BRAILLE_SPINNER_FRAMES[spinnerFrameIndex]
													: " ";
											const rowLabel = item.isDeletePending
												? "Press Ctrl+D again to confirm"
												: item.label;

											return (
												// biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive session list primitive here.
												<box
													key={item.id}
													id={getCommandPickerRowId("sessions", item.id)}
													flexDirection="row"
													backgroundColor={rowBackground}
													paddingLeft={1}
													paddingRight={3}
													gap={1}
													onMouseMove={() => {
														setSelectedIndex(itemIndex);
													}}
													onMouseDown={(event) => {
														if (event.button !== 0) {
															return;
														}
														event.preventDefault();
														event.stopPropagation();
														setSelectedIndex(itemIndex);
													}}
													onMouseUp={(event) => {
														if (event.button !== 0) {
															return;
														}
														event.preventDefault();
														event.stopPropagation();
														onSelect(item.id);
													}}
												>
													<text
														fg={
															isSelected ? SESSION_SELECTED_TEXT : rowForeground
														}
													>
														{marker}
													</text>
													<box flexGrow={1} paddingLeft={3} minWidth={0}>
														<text
															fg={rowForeground}
															attributes={
																isSelected ? TextAttributes.BOLD : undefined
															}
															overflow="hidden"
															wrapMode="none"
														>
															{rowLabel}
														</text>
													</box>
													<text
														fg={
															isSelected
																? SESSION_SELECTED_TEXT
																: SESSION_MUTED_TEXT
														}
													>
														{formatSessionTime(item.updatedAt)}
													</text>
												</box>
											);
										})}
									</box>
								))}
							</box>
						</scrollbox>
					) : (
						<box paddingLeft={4} paddingRight={4} paddingTop={1}>
							<text fg={SESSION_MUTED_TEXT}>
								{normalizeQuery(query) ? "No results found" : state.emptyText}
							</text>
						</box>
					)}
					{state.footerActions && state.footerActions.length > 0 ? (
						<box
							paddingLeft={4}
							paddingRight={4}
							paddingTop={1}
							flexDirection="row"
							gap={2}
						>
							{state.footerActions.map((action) => (
								<box key={action.label} flexDirection="row" gap={1}>
									<text fg={SESSION_TEXT} attributes={TextAttributes.BOLD}>
										{action.label}
									</text>
									<text fg={SESSION_MUTED_TEXT}>{action.shortcut}</text>
								</box>
							))}
						</box>
					) : (
						<box flexShrink={0} />
					)}
				</box>
			</box>
		</box>
	);
}
