type DestroyableRenderer = {
  destroy: () => Promise<unknown> | unknown;
  isDestroyed: boolean;
};

export function destroyRenderer(renderer: DestroyableRenderer) {
  if (renderer.isDestroyed) {
    return;
  }

  void renderer.destroy();
}
