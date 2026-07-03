import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatErrorForLog, formatRendererErrorForLog } from "../error-service";
import { LoggerService } from "../logger-service";

describe("error and logger services", () => {
  it("formats errors for single-line log entries", () => {
    const formatted = formatErrorForLog(new Error("line one\nline two"));
    const renderer = formatRendererErrorForLog({
      message: "render\nfailed",
      stack: "stack\tline",
      componentStack: "component\nstack",
    });

    expect(formatted).toContain("line one line two");
    expect(renderer).toContain("renderer-error");
    expect(renderer).not.toContain("\n");
  });

  it("writes and reads recent log lines", async () => {
    const directory = join(tmpdir(), `suwol-audio-logs-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const logger = new LoggerService(directory);

    await logger.info("first");
    await logger.warn("second");
    await logger.error("third");

    expect(logger.getLogDirectory()).toContain("logs");
    expect(await logger.readRecentLines(2)).toHaveLength(2);
    expect((await logger.readRecentLines(1))[0]).toContain("third");
  });
});
