import Database from "better-sqlite3";

const DB_PATH = process.env.SQLITE_PATH ?? "./sample.db";

/** Open the SQLite DB (must exist). */
export const openDb = () => new Database(DB_PATH, { fileMustExist: true });
export const dbPath = DB_PATH;
