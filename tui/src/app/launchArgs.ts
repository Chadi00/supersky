export function resolveInitialSessionId(argv = process.argv) {
	const candidate = argv[2]?.trim();
	if (!candidate || candidate.startsWith("-")) {
		return null;
	}

	return candidate;
}
