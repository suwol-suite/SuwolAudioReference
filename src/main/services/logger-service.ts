import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class LoggerService {
  readonly logPath: string;

  constructor(userDataPath: string) {
    this.logPath = join(userDataPath, "logs", "app.log");
  }

  async info(message: string): Promise<void> {
    await this.write("info", message);
  }

  async warn(message: string): Promise<void> {
    await this.write("warn", message);
  }

  async error(message: string): Promise<void> {
    await this.write("error", message);
  }

  getLogDirectory(): string {
    return dirname(this.logPath);
  }

  async readRecentLines(limit = 80): Promise<string[]> {
    try {
      const content = await readFile(this.logPath, "utf8");
      return content.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(limit, 500)));
    } catch {
      return [];
    }
  }

  private async write(level: string, message: string): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, `${new Date().toISOString()} ${level} ${message}\n`, "utf8");
  }
}
