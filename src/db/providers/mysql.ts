import mysql from "mysql2/promise";
import type { DB } from "../provider.js";

const pool = mysql.createPool(process.env.DATABASE_URL ?? "");

export const mysqlDb: DB = {
  dialect: "mysql",
  async query<T>(text: string, params: any[]) {
    const [rows] = await pool.query(text, params);
    const arr = Array.isArray(rows) ? (rows as T[]) : [];
    return { rows: arr, rowCount: arr.length };
  }
};
