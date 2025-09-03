// src/db/providers/oracle.ts
import oracledb from "oracledb";
import type { DB } from "../provider.js";

/**
 * Expected .env example(s):
 *   DB_PROVIDER=oracle
 *   # XE 21c default PDB
 *   DATABASE_URL=system/oracle@127.0.0.1:1521/XEPDB1
 *   # 23ai Free default PDB
 *   # DATABASE_URL=system/oracle@127.0.0.1:1521/FREEPDB1
 *
 * Notes:
 * - node-oracledb defaults to Thin mode => no Oracle Client install required.  [1](https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html)[2](https://node-oracledb.readthedocs.io/en/latest/user_guide/appendix_a.html)
 * - Default service names: XE uses XEPDB1; 23ai Free uses FREEPDB1.          [3](https://www.typeerror.org/docs/mariadb/installing-mariadb-windows-zip-packages/index)[4](https://www.enterprisedb.com/download-postgresql-binaries)
 */

const dsn = process.env.DATABASE_URL ?? "";
const cfg = parseEzConnect(dsn); // { user, password, connectString }

if (!cfg) {
  throw new Error(
    `Invalid or missing DATABASE_URL for Oracle.
     Expected format: USER/PASSWORD@HOST:1521/SERVICE
     e.g., system/oracle@127.0.0.1:1521/XEPDB1`
  );
}

// Singleton pool
const poolPromise = oracledb.createPool({
  user: cfg.user,
  password: cfg.password,
  connectString: cfg.connectString,
  poolMin: 0,
  poolMax: 4,
  poolIncrement: 1
});

export const oracleDb: DB = {
  dialect: "oracle",
  async query<T>(text: string, params: Record<string, any>) {
    const pool = await poolPromise;
    const conn = await pool.getConnection();
    try {
      const sql = normalizeSql(text);
      const res = await conn.execute<T>(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true
      });
      const rows = (res.rows ?? []) as unknown as T[];
      const rowCount = rows.length || (res.rowsAffected ?? 0);
      return { rows, rowCount };
    } finally {
      await conn.close();
    }
  },
  async close() {
    const pool = await poolPromise;
    await pool.close(0);
  }
};

/** Accepts USER/PASSWORD@HOST:PORT/SERVICE and returns user/password/connectString */
function parseEzConnect(dsn: string):
  | { user: string; password: string; connectString: string }
  | null {
  const m = dsn.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (!m) return null;
  const [, user, password, connectString] = m;
  return { user, password, connectString };
}

/** Oracle requires FROM DUAL for scalar selects; make 'SELECT 1' work nicely */
function normalizeSql(sql: string): string {
  const s = sql.trim().replace(/;$/, "");
  if (/^select\s+1\s*$/i.test(s)) return "SELECT 1 AS OK FROM DUAL";
  return sql;
}
