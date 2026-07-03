import type { BrowserWindow, RenderProcessGoneDetails } from "electron";
import type { LoggerService } from "./logger-service";

export interface RendererErrorLogInput {
  message: string;
  stack?: string;
  componentStack?: string;
}

export function registerProcessErrorHandlers(loggerService: LoggerService): void {
  process.on("uncaughtException", (error) => {
    void loggerService.error(`uncaughtException ${formatErrorForLog(error)}`);
  });

  process.on("unhandledRejection", (reason) => {
    void loggerService.error(`unhandledRejection ${formatErrorForLog(reason)}`);
  });
}

export function registerWindowErrorLogging(window: BrowserWindow, loggerService: LoggerService): void {
  window.webContents.on("render-process-gone", (_event, details: RenderProcessGoneDetails) => {
    void loggerService.error(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  window.webContents.on("unresponsive", () => {
    void loggerService.warn("window unresponsive");
  });
}

export function formatRendererErrorForLog(input: RendererErrorLogInput): string {
  return [
    `renderer-error message=${sanitizeForLog(input.message)}`,
    input.stack ? `stack=${sanitizeForLog(input.stack)}` : "",
    input.componentStack ? `componentStack=${sanitizeForLog(input.componentStack)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return `${sanitizeForLog(error.name)}: ${sanitizeForLog(error.message)}${error.stack ? ` stack=${sanitizeForLog(error.stack)}` : ""}`;
  }
  return sanitizeForLog(String(error));
}

function sanitizeForLog(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 4000);
}
