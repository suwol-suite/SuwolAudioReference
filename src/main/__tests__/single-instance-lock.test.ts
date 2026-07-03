import { describe, expect, it } from "vitest";
import { focusExistingWindow, registerSingleInstanceLock, type FocusableWindow } from "../single-instance-lock";

class FakeWindow implements FocusableWindow {
  focused = false;
  restored = false;
  shown = false;

  constructor(private readonly minimized: boolean) {}

  isMinimized(): boolean {
    return this.minimized;
  }

  restore(): void {
    this.restored = true;
  }

  focus(): void {
    this.focused = true;
  }

  show(): void {
    this.shown = true;
  }
}

describe("single instance lock", () => {
  it("focuses the existing window for a second app instance", () => {
    let secondInstanceHandler: (() => void) | undefined;
    const window = new FakeWindow(true);
    const app = {
      quitCalled: false,
      requestSingleInstanceLock: () => true,
      quit() {
        this.quitCalled = true;
      },
      on(event: "second-instance", listener: () => void) {
        if (event === "second-instance") {
          secondInstanceHandler = listener;
        }
      },
    };

    expect(registerSingleInstanceLock(app, () => window)).toBe(true);
    secondInstanceHandler?.();

    expect(app.quitCalled).toBe(false);
    expect(window.restored).toBe(true);
    expect(window.shown).toBe(true);
    expect(window.focused).toBe(true);
  });

  it("quits before app startup when the lock is already held", () => {
    const app = {
      quitCalled: false,
      requestSingleInstanceLock: () => false,
      quit() {
        this.quitCalled = true;
      },
      on() {
        throw new Error("second-instance listener should not be registered");
      },
    };

    expect(registerSingleInstanceLock(app, () => null)).toBe(false);
    expect(app.quitCalled).toBe(true);
  });

  it("does nothing when no existing window is available yet", () => {
    expect(focusExistingWindow(null)).toBe(false);
  });
});
