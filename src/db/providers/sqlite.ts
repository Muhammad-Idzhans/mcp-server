import Database from "better-sqlite3";
import type { DB } from "../provider.js";

const dbFile = process.env.SQLITE_PATH ?? "sample.db";
const handle = new Database(dbFile);

export const sqliteDb: DB = {
  dialect: "sqlite",
  async query<T>(text: string, params: Record<string, any>) {
    const stmt = handle.prepare(text);
    // better-sqlite3 supports :name directly
    const rows = stmt.all(params) as T[];
    return { rows, rowCount: rows.length };
  },
  close() { handle.close(); }
};
