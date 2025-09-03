import "dotenv/config";
import { getDb } from "../src/db/index.js";

async function main() {
  const db = await getDb();

  const queries: Record<string, { sql: string; params: any }> = {
    sqlite: { sql: "SELECT 1 AS ok", params: {} },
    pg:     { sql: "SELECT 1 AS ok", params: [] },
    mysql:  { sql: "SELECT 1 AS ok", params: [] },
    mssql:  { sql: "SELECT 1 AS ok", params: [] },
    oracle: { sql: "SELECT 1 AS ok FROM dual", params: {} }
  };

  const q = queries[db.dialect];
  const res = await db.query(q.sql, q.params);

  console.log(`Dialect: ${db.dialect}`);
  console.log(res.rows);
}

main().catch(err => { console.error(err); process.exit(1); });
