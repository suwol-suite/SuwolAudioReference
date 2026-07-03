export interface FocusableWindow {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  show?(): void;
}

export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", listener: () => void): void;
}

export function focusExistingWindow(window: FocusableWindow | null): boolean {
  if (!window) {
    return false;
  }

  if (window.isMinimized()) {
    window.restore();
  }
  window.show?.();
  window.focus();
  return true;
}

export function registerSingleInstanceLock(
  app: SingleInstanceApp,
  getMainWindow: () => FocusableWindow | null,
): boolean {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
    return false;
  }

  app.on("second-instance", () => {
    focusExistingWindow(getMainWindow());
  });
  return true;
}
