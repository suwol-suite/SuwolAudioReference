import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";

export type SqlParams = SQLInputValue[] | Record<string, SQLInputValue>;

export class LibraryDatabase {
  private readonly database: DatabaseSync;

  constructor(readonly databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA journal_mode = WAL;");
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  run(sql: string, params: SqlParams = []): unknown {
    const statement = this.database.prepare(sql);
    return Array.isArray(params) ? statement.run(...params) : statement.run(params);
  }

  get<T>(sql: string, params: SqlParams = []): T | undefined {
    const statement = this.database.prepare(sql);
    return (Array.isArray(params) ? statement.get(...params) : statement.get(params)) as T | undefined;
  }

  all<T>(sql: string, params: SqlParams = []): T[] {
    const statement = this.database.prepare(sql);
    return (Array.isArray(params) ? statement.all(...params) : statement.all(params)) as T[];
  }

  transaction<T>(callback: () => T): T {
    this.exec("BEGIN IMMEDIATE;");
    try {
      const result = callback();
      this.exec("COMMIT;");
      return result;
    } catch (error) {
      this.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}
