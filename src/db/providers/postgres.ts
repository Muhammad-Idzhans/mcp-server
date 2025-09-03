import { Pool } from "pg";
import type { DB } from "../provider.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const pgDb: DB = {
  dialect: "pg",
  async query<T>(text: string, params: any[]) {
    const res = await pool.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
  }
};
