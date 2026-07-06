import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
}));

vi.mock("electron", () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      ipcMock.handlers.set(channel, handler);
    }),
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}));

describe("registerIpcHandlers release status", () => {
  beforeEach(() => {
    ipcMock.handlers.clear();
  });

  it("returns release status through the releaseStatus:get IPC handler", async () => {
    const { registerIpcHandlers } = await import("../register-ipc");
    const releaseStatus = {
      currentVersion: "0.1.3",
      distributionKind: "windows_zip",
    };
    const releaseStatusService = {
      getStatus: vi.fn(() => releaseStatus),
      openReleases: vi.fn(),
      openLatestRelease: vi.fn(),
      openChecksumsHelp: vi.fn(),
    };

    registerIpcHandlers({} as any, () => null, async () => {}, undefined, releaseStatusService as any);

    const handler = ipcMock.handlers.get("releaseStatus:get");
    expect(handler).toBeDefined();
    expect(await handler?.({})).toEqual(releaseStatus);
    expect(releaseStatusService.getStatus).toHaveBeenCalledOnce();
  });
});
