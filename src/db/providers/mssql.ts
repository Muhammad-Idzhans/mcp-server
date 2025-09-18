// src/db/providers/mssql.ts
import mssql from 'mssql';
import type { DB } from '../provider.js';

export default function createMssqlDb(): DB {
  const connectionString = process.env.DATABASE_URL!;
  let pool: mssql.ConnectionPool | null = null;
  let connectPromise: Promise<mssql.ConnectionPool> | null = null;

  async function getPool(): Promise<mssql.ConnectionPool> {
    if (pool && pool.connected) return pool;
    if (!connectPromise) {
      connectPromise = new mssql.ConnectionPool(connectionString)
        .connect()
        .then(p => {
          pool = p;
          return p;
        })
        .catch(err => {
          connectPromise = null;
          throw err;
        });
    }
    return connectPromise;
  }

  return {
    dialect: 'mssql',

    async query(text, params?: any) {
      const p = await getPool();
      const req = p.request();

      // Support both array and object parameters
      if (params) {
        if (Array.isArray(params)) {
          // Will work if SQL uses @p1, @p2, ... (your param mapper can generate this)
          params.forEach((v, i) => req.input(`p${i + 1}`, v));
        } else if (typeof params === 'object') {
          for (const [k, v] of Object.entries(params)) {
            req.input(k, v as any);
          }
        }
      }

      const result = await req.query(text);
      const rows = result.recordset ?? [];
      return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
    },

    async close() {
      try {
        await pool?.close();
      } finally {
        pool = null;
        connectPromise = null;
      }
    },
  };
}
