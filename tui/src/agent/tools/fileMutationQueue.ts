const queueByPath = new Map<string, Promise<unknown>>();

export async function withFileMutationQueue<T>(
	absolutePath: string,
	operation: () => Promise<T>,
) {
	const previous = queueByPath.get(absolutePath) ?? Promise.resolve();
	let release = () => {};

	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const queued = previous.then(() => current);
	queueByPath.set(absolutePath, queued);

	await previous;
	try {
		return await operation();
	} finally {
		release();
		if (queueByPath.get(absolutePath) === queued) {
			queueByPath.delete(absolutePath);
		}
	}
}
