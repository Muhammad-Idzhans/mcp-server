import sql from "mssql";
import type { DB } from "../provider.js";

const connection = process.env.DATABASE_URL ?? ""; // e.g., Server=host,1433;Database=db;User Id=u;Password=p;Encrypt=true
const poolPromise = sql.connect(connection);

export const mssqlDb: DB = {
  dialect: "mssql",
  async query<T>(text: string, params: { name: string; value: any }[]) {
    const pool = await poolPromise;
    const request = pool.request();
    for (const p of params) request.input(p.name, p.value); // you can specify sql.VarChar, etc., if needed
    const res = await request.query<T>(text);
    const rows = res.recordset ?? [];
    return { rows, rowCount: rows.length };
  }
};
