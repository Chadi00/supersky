import { useEffect, useState } from "react";

import { BRAILLE_SPINNER_FRAMES } from "./brailleSpinner";

export function useSpinnerFrame(
	frames: readonly string[],
	active = true,
	intervalMs = 80,
) {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		if (!active) {
			setFrameIndex(0);
			return;
		}

		const id = setInterval(() => {
			setFrameIndex((i) => (i + 1) % frames.length);
		}, intervalMs);

		return () => clearInterval(id);
	}, [active, frames, intervalMs]);

	return frames[frameIndex] ?? frames[0] ?? "";
}

export function useBrailleSpinnerFrame(active = true, intervalMs = 80) {
	return useSpinnerFrame(BRAILLE_SPINNER_FRAMES, active, intervalMs);
}
