// src/db/providers/postgres.ts
import { Pool } from 'pg';
import type { DB } from '../provider.js';

export default function createPostgresDb(): DB {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  return {
    dialect: 'pg',

    async query(text, params?: any) {
      // Your param mapper should already convert :name → $1,$2 and give an array
      const res = await pool.query(text, Array.isArray(params) ? params : undefined);
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    },

    async close() {
      await pool.end();
    },
  };
}
