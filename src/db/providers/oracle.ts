// src/db/providers/oracle.ts
import oracledb from 'oracledb';
import type { DB } from '../provider.js';

function parseEzConnect(url: string) {
  // DATABASE_URL format expected: user/password@host:port/service
  const m = url.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (!m) return null;
  const [, user, password, connectString] = m;
  return { user, password, connectString };
}

function normalizeSql(sql: string): string {
  // Make "SELECT 1" portable in Oracle
  return /^\s*select\s+1\s*;?\s*$/i.test(sql)
    ? 'SELECT 1 AS "OK" FROM DUAL'
    : sql;
}

export default function createOracleDb(): DB {
  // Prefer ORACLE_* if provided; else parse DATABASE_URL (EZCONNECT)
  const url = process.env.DATABASE_URL!;
  const fromUrl = parseEzConnect(url) ?? {};
  const user = process.env.ORACLE_USER ?? (fromUrl as any).user;
  const password = process.env.ORACLE_PASSWORD ?? (fromUrl as any).password;
  const connectString = process.env.ORACLE_CONNECT_STRING ?? (fromUrl as any).connectString;

  if (!user || !password || !connectString) {
    throw new Error('Oracle config missing: user/password/connectString');
  }

  let pool: oracledb.Pool | null = null;
  let poolPromise: Promise<oracledb.Pool> | null = null;

  async function getPool(): Promise<oracledb.Pool> {
    if (pool) return pool;
    if (!poolPromise) {
      poolPromise = oracledb
        .createPool({
          user,
          password,
          connectString,
          // You can expose pool tuning here if needed (poolMin, poolMax, stmtCacheSize, etc.)
        })
        .then(p => {
          pool = p;
          return p;
        })
        .catch(err => {
          poolPromise = null;
          throw err;
        });
    }
    return poolPromise;
  }

  return {
    dialect: 'oracle',

    async query(text, params?: any) {
      const p = await getPool();
      const conn = await p.getConnection();
      try {
        const sql = normalizeSql(text);
        const bind = params ?? {};
        const res = await conn.execute(sql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const rows = (res.rows as any[]) ?? [];
        return { rows, rowCount: rows.length };
      } finally {
        await conn.close();
      }
    },

    async close() {
      try {
        await pool?.close(0);
      } finally {
        pool = null;
        poolPromise = null;
      }
    },
  };
}
