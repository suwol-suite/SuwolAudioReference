import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, APP_NAME } from "../shared/app-metadata";
import { refreshApplicationMenu } from "./i18n/main-i18n";
import { createAppServices } from "./services/app-services";
import { registerProcessErrorHandlers, registerWindowErrorLogging } from "./services/error-service";
import { registerIpcHandlers } from "./ipc/register-ipc";
import { registerSingleInstanceLock } from "./single-instance-lock";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;

app.setName(APP_NAME);

const hasSingleInstanceLock = registerSingleInstanceLock(app, () => mainWindow);

if (hasSingleInstanceLock) {
  const services = createAppServices(app.getPath("userData"));
  registerProcessErrorHandlers(services.loggerService);
  registerIpcHandlers(services, () => mainWindow, () => refreshApplicationMenu(services.settingsService));

  async function createWindow(): Promise<void> {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1120,
      minHeight: 720,
      title: APP_NAME,
      icon: join(__dirname, "../../build/icon.png"),
      backgroundColor: "#121416",
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    if (isDev) {
      await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    } else {
      await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    registerWindowErrorLogging(mainWindow, services.loggerService);
  }

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: "Copyright 2026 Suwol Audio Reference contributors",
      iconPath: join(__dirname, "../../build/icon.png"),
    });
    await refreshApplicationMenu(services.settingsService);
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    services.libraryService.closeActive();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
