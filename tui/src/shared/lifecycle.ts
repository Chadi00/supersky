type DestroyableRenderer = {
	destroy: () => Promise<unknown> | unknown;
	isDestroyed: boolean;
};

type AppLifecycle = {
	requestProcessExit: () => void;
};

export const appLifecycle: AppLifecycle = {
	requestProcessExit() {
		process.kill(process.pid, "SIGTERM");
	},
};

export function destroyRenderer(renderer: DestroyableRenderer) {
	if (renderer.isDestroyed) {
		return;
	}

	return renderer.destroy();
}

export function destroyRendererAndExit(
	renderer: DestroyableRenderer,
	lifecycle: AppLifecycle = appLifecycle,
) {
	if (renderer.isDestroyed) {
		lifecycle.requestProcessExit();
		return;
	}

	const destroyResult = renderer.destroy();

	if (
		destroyResult !== null &&
		typeof destroyResult === "object" &&
		"then" in destroyResult
	) {
		void Promise.resolve(destroyResult).finally(() => {
			lifecycle.requestProcessExit();
		});
		return;
	}

	lifecycle.requestProcessExit();
}
