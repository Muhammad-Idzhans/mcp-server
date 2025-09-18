import mysql from 'mysql2/promise';
import type { DB } from '../provider.js';

export default function createMysqlDb(): DB {
  const url = process.env.DATABASE_URL!;
  const pool = mysql.createPool(url);

  return {
    dialect: 'mysql',
    async query(sql, params) {
      const [rows] = await pool.query(sql, params);
      return { rows: rows as any[], rowCount: Array.isArray(rows) ? rows.length : 0 };
    },
    async close() {
      await pool.end();
    }
  };
}
