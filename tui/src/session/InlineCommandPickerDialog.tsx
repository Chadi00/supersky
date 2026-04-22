import type { ScrollBoxRenderable } from "@opentui/core";
import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
	getCommandPickerRowId,
	type InlineCommandPickerState,
} from "./commandPicker";

const DIALOG_WIDTH = 88;
const OVERLAY_BACKGROUND = RGBA.fromInts(0, 0, 0, 150);
const PANEL_BACKGROUND = "#141414";
const TEXT = "#eeeeee";
const MUTED_TEXT = "#808080";
const SELECTED_BACKGROUND = "#fab283";
const SELECTED_TEXT = "#0a0a0a";

type InlineCommandPickerDialogProps = {
	state: InlineCommandPickerState;
	onClose: () => void;
	onSelect: (itemId: string) => void;
};

function normalizeQuery(value: string) {
	return value.trim().toLowerCase();
}

function filterItems(state: InlineCommandPickerState, query: string) {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) {
		return state.items;
	}

	return state.items
		.map((item, index) => {
			const normalizedLabel = item.label.toLowerCase();
			const normalizedMeta = item.meta?.toLowerCase() ?? "";
			const normalizedId = item.id.toLowerCase();
			const prefixMatch =
				normalizedLabel.startsWith(normalizedQuery) ||
				normalizedMeta.startsWith(normalizedQuery) ||
				normalizedId.startsWith(normalizedQuery);
			const includesMatch =
				prefixMatch ||
				normalizedLabel.includes(normalizedQuery) ||
				normalizedMeta.includes(normalizedQuery) ||
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
				item: InlineCommandPickerState["items"][number];
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

export function InlineCommandPickerDialog({
	state,
	onClose,
	onSelect,
}: InlineCommandPickerDialogProps) {
	const { width, height } = useTerminalDimensions();
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);
	const [query, setQuery] = useState(state.filterText ?? "");
	const [selectedIndex, setSelectedIndex] = useState(0);

	const filteredItems = useMemo(
		() => filterItems(state, query),
		[state, query],
	);
	const visibleRowCount = useMemo(() => {
		const maxVisibleRows = Math.max(4, Math.floor(height / 2) - 6);
		return Math.max(1, Math.min(filteredItems.length || 1, maxVisibleRows));
	}, [filteredItems.length, height]);
	const selectedItem = filteredItems[selectedIndex] ?? filteredItems[0] ?? null;
	const dialogWidth = Math.max(56, Math.min(DIALOG_WIDTH, width - 2));

	useEffect(() => {
		setQuery(state.filterText ?? "");
	}, [state.filterText]);

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
		if (!selectedItem) {
			return;
		}

		scrollboxRef.current?.scrollChildIntoView(
			getCommandPickerRowId(state.kind, selectedItem.id),
		);
	}, [selectedItem, state.kind]);

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
			return;
		}

		if (key.name === "return" || key.name === "tab") {
			if (!selectedItem) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			onSelect(selectedItem.id);
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
				backgroundColor={PANEL_BACKGROUND}
				paddingTop={1}
			>
				<box flexDirection="column" gap={1} paddingBottom={1}>
					<box paddingLeft={4} paddingRight={4}>
						<box flexDirection="row" justifyContent="space-between">
							<text fg={TEXT} attributes={TextAttributes.BOLD}>
								{state.title}
							</text>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI text is the clickable close affordance here. */}
							<text
								fg={MUTED_TEXT}
								onMouseUp={() => {
									onClose();
								}}
							>
								esc
							</text>
						</box>
						{state.helperText ? (
							<text fg={MUTED_TEXT} paddingTop={1}>
								{state.helperText}
							</text>
						) : null}
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
								backgroundColor={PANEL_BACKGROUND}
								textColor={MUTED_TEXT}
								focusedBackgroundColor={PANEL_BACKGROUND}
								focusedTextColor={MUTED_TEXT}
								placeholderColor={MUTED_TEXT}
							/>
						</box>
					</box>
					{filteredItems.length > 0 ? (
						<scrollbox
							key={`${state.kind}\u0000${query}\u0000${filteredItems.map((item) => item.id).join("\u0000")}`}
							ref={scrollboxRef}
							height={visibleRowCount}
							focused={false}
							scrollX={false}
							style={{
								rootOptions: { backgroundColor: PANEL_BACKGROUND },
								wrapperOptions: { backgroundColor: PANEL_BACKGROUND },
								viewportOptions: { backgroundColor: PANEL_BACKGROUND },
								contentOptions: { backgroundColor: PANEL_BACKGROUND },
								scrollbarOptions: { visible: false },
								verticalScrollbarOptions: { visible: false },
								horizontalScrollbarOptions: { visible: false },
							}}
						>
							<box flexDirection="column" paddingLeft={1} paddingRight={1}>
								{filteredItems.map((item) => {
									const itemIndex = filteredItems.indexOf(item);
									const isSelected = itemIndex === selectedIndex;
									const isCurrent = item.id === state.selectedItemId;
									const rowForeground = isSelected
										? SELECTED_TEXT
										: isCurrent
											? SELECTED_BACKGROUND
											: TEXT;
									const marker = isCurrent ? "●" : (item.prefix ?? " ");

									return (
										// biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI box rows are the interactive picker primitive here.
										<box
											key={item.id}
											id={getCommandPickerRowId(state.kind, item.id)}
											flexDirection="row"
											backgroundColor={
												isSelected ? SELECTED_BACKGROUND : PANEL_BACKGROUND
											}
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
											<text fg={isSelected ? SELECTED_TEXT : rowForeground}>
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
													{item.label}
												</text>
											</box>
											{item.meta ? (
												<text fg={isSelected ? SELECTED_TEXT : MUTED_TEXT}>
													{item.meta}
												</text>
											) : null}
										</box>
									);
								})}
							</box>
						</scrollbox>
					) : (
						<box paddingLeft={4} paddingRight={4} paddingTop={1}>
							<text fg={MUTED_TEXT}>
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
									<text fg={TEXT} attributes={TextAttributes.BOLD}>
										{action.label}
									</text>
									<text fg={MUTED_TEXT}>{action.shortcut}</text>
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
