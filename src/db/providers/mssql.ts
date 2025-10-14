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
        .then(p => { pool = p; return p; })
        .catch(err => { connectPromise = null; throw err; });
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
          // Accept either positional values OR {name, value} objects
          let posIndex = 0;
          for (const v of params) {
            if (v && typeof v === 'object' && 'name' in v) {
              req.input(String((v as any).name), (v as any).value as any);
            } else {
              req.input(`p${++posIndex}`, v as any);
            }
          }
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
      try { await pool?.close(); }
      finally { pool = null; connectPromise = null; }
    },
  };
}