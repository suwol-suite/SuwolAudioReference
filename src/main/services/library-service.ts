import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { LibraryDatabase } from "../db/library-database";
import { runMigrations } from "../db/migrate";
import type { CollectionRecord, LibraryRecord, LibrarySnapshot, RecentLibraryRecord, TagRecord } from "../../shared/library-types";

interface LibraryRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
}

interface TagRow {
  id: string;
  library_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface CollectionRow {
  id: string;
  library_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveLibraryContext {
  library: LibraryRecord;
  db: LibraryDatabase;
}

export class LibraryService {
  private active: ActiveLibraryContext | null = null;

  constructor(private readonly recentFilePath: string) {}

  async createLibrary(rootPath: string, name?: string): Promise<LibrarySnapshot> {
    return this.openOrCreateLibrary(rootPath, name);
  }

  async openLibrary(rootPath: string): Promise<LibrarySnapshot> {
    return this.openOrCreateLibrary(rootPath);
  }

  async listRecentLibraries(): Promise<RecentLibraryRecord[]> {
    try {
      const content = await readFile(this.recentFilePath, "utf8");
      const parsed = JSON.parse(content) as RecentLibraryRecord[];
      return parsed
        .filter((item) => item.libraryPath && item.name)
        .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
    } catch {
      return [];
    }
  }

  getActive(): ActiveLibraryContext | null {
    return this.active;
  }

  requireActive(): ActiveLibraryContext {
    if (!this.active) {
      throw new Error("라이브러리가 열려 있지 않습니다.");
    }
    return this.active;
  }

  closeActive(): void {
    this.active?.db.close();
    this.active = null;
  }

  async snapshot(): Promise<LibrarySnapshot> {
    const context = this.requireActive();
    return {
      library: context.library,
      tags: context.db.all<TagRow>("SELECT * FROM tags WHERE library_id = ? ORDER BY name COLLATE NOCASE", [
        context.library.id,
      ]).map(mapTagRow),
      collections: context.db.all<CollectionRow>(
        "SELECT * FROM collections WHERE library_id = ? ORDER BY name COLLATE NOCASE",
        [context.library.id],
      ).map(mapCollectionRow),
    };
  }

  private async openOrCreateLibrary(inputPath: string, name?: string): Promise<LibrarySnapshot> {
    const rootPath = normalizeLibraryRoot(inputPath);
    const storagePath = join(rootPath, ".suwol-audio");
    const assetsPath = join(storagePath, "assets");
    const databasePath = join(storagePath, "library.sqlite");
    await mkdir(assetsPath, { recursive: true });

    const db = new LibraryDatabase(databasePath);
    runMigrations(db);
    const now = new Date().toISOString();
    const existing = db.get<LibraryRow>("SELECT * FROM libraries WHERE root_path = ?", [rootPath]);
    const libraryName = name?.trim() || existing?.name || basename(rootPath) || "Suwol Audio Library";

    if (existing) {
      db.run(
        `
        UPDATE libraries
        SET name = ?, updated_at = ?, last_opened_at = ?
        WHERE id = ?
        `,
        [libraryName, now, now, existing.id],
      );
    } else {
      db.run(
        `
        INSERT INTO libraries (id, name, root_path, created_at, updated_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [randomUUID(), libraryName, rootPath, now, now, now],
      );
    }

    const row = db.get<LibraryRow>("SELECT * FROM libraries WHERE root_path = ?", [rootPath]);
    if (!row) {
      db.close();
      throw new Error("라이브러리 레코드를 만들 수 없습니다.");
    }

    this.closeActive();
    this.active = {
      db,
      library: mapLibraryRow(row, databasePath, assetsPath),
    };

    await this.rememberRecent(this.active.library);
    return this.snapshot();
  }

  private async rememberRecent(library: LibraryRecord): Promise<void> {
    const current = await this.listRecentLibraries();
    const next: RecentLibraryRecord = {
      id: library.id,
      libraryPath: library.rootPath,
      name: library.name,
      lastOpenedAt: library.lastOpenedAt,
    };
    const merged = [next, ...current.filter((item) => item.libraryPath !== library.rootPath)].slice(0, 12);
    await mkdir(dirname(this.recentFilePath), { recursive: true });
    await writeFile(this.recentFilePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

    this.active?.db.run(
      `
      INSERT INTO recent_libraries (id, library_path, name, last_opened_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(library_path) DO UPDATE SET
        name = excluded.name,
        last_opened_at = excluded.last_opened_at
      `,
      [next.id, next.libraryPath, next.name, next.lastOpenedAt],
    );
  }
}

export function getLibraryStoragePaths(rootPath: string): { storagePath: string; assetsPath: string; databasePath: string } {
  const storagePath = join(rootPath, ".suwol-audio");
  return {
    storagePath,
    assetsPath: join(storagePath, "assets"),
    databasePath: join(storagePath, "library.sqlite"),
  };
}

function normalizeLibraryRoot(inputPath: string): string {
  const resolved = resolve(inputPath);
  if (basename(resolved).toLowerCase() === ".suwol-audio") {
    return dirname(resolved);
  }
  if (basename(resolved).toLowerCase() === "library.sqlite") {
    return dirname(dirname(resolved));
  }
  return resolved;
}

function mapLibraryRow(row: LibraryRow, databasePath: string, assetsPath: string): LibraryRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    databasePath,
    assetsPath,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export function mapTagRow(row: TagRow): TagRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCollectionRow(row: CollectionRow): CollectionRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
