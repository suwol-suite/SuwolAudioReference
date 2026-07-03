import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from "electron";
import type { Locale } from "../../shared/i18n/locales";
import koMessages from "./locales/ko.json";
import enMessages from "./locales/en.json";
import type { SettingsService } from "../services/settings-service";

type MainMessageKey = keyof typeof koMessages;

const MAIN_MESSAGES: Record<Locale, Record<string, string>> = {
  ko: koMessages,
  en: enMessages,
};

export function tMain(locale: Locale, key: MainMessageKey): string {
  return MAIN_MESSAGES[locale]?.[key] ?? MAIN_MESSAGES.ko[key] ?? MAIN_MESSAGES.en[key] ?? key;
}

export async function getMainLocale(settingsService: SettingsService): Promise<Locale> {
  return (await settingsService.read()).locale;
}

export async function refreshApplicationMenu(settingsService: SettingsService): Promise<void> {
  const locale = await getMainLocale(settingsService);
  const template: MenuItemConstructorOptions[] = [
    {
      label: tMain(locale, "menu.file"),
      submenu: [
        { label: tMain(locale, "menu.newLibrary"), accelerator: "CmdOrCtrl+N", click: sendMenuCommand("library:create") },
        { label: tMain(locale, "menu.openLibrary"), accelerator: "CmdOrCtrl+O", click: sendMenuCommand("library:open") },
        { label: tMain(locale, "menu.import"), accelerator: "CmdOrCtrl+I", click: sendMenuCommand("assets:import") },
        { type: "separator" },
        { label: tMain(locale, "menu.quit"), role: "quit" },
      ],
    },
    {
      label: tMain(locale, "menu.view"),
      submenu: [{ label: tMain(locale, "menu.reload"), role: "reload" }],
    },
    {
      label: tMain(locale, "menu.help"),
      submenu: [
        {
          label: "Suwol Audio Reference",
          click: () => app.showAboutPanel(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendMenuCommand(command: string): MenuItemConstructorOptions["click"] {
  return () => {
    BrowserWindow.getFocusedWindow()?.webContents.send("menu:command", command);
  };
}
