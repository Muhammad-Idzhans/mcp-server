import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';

import { getDb } from '../db/index.js';
import { mapNamedToDriver } from '../db/paramMap.js';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8787);

// Keep types flexible for a generic SQL bridge
type Row = Record<string, any>;

let db: Awaited<ReturnType<typeof getDb>>;

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

// POST /sql/query
// Body: { sql: string, params?: Record<string, any>, readOnly?: boolean, rowLimit?: number }
app.post('/sql/query', async (req: Request, res: Response) => {
  try {
    const {
      sql,
      params = {},
      readOnly = true,
      rowLimit = 1000,
    }: {
      sql?: unknown;
      params?: Record<string, any>;
      readOnly?: boolean;
      rowLimit?: number;
    } = req.body ?? {};

    if (typeof sql !== 'string' || !sql.trim()) {
      return res.status(400).json({ error: "Body 'sql' is required." });
    }
    if (readOnly && !/^\s*select\b/i.test(sql)) {
      return res.status(400).json({ error: 'readOnly mode: only SELECT is allowed.' });
    }

    // Driver-aware mapping for named params (e.g., @minDate for MSSQL)
    const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);

    const t0 = Date.now();
    const { rows, rowCount } = await db.query<Row>(text, mapped);
    const ms = Date.now() - t0;

    // Respect rowLimit to avoid huge payloads
    const limited: Row[] = Array.isArray(rows)
      ? rows.length > rowLimit
        ? rows.slice(0, rowLimit)
        : rows
      : [];

    // Helpful headers for quick debugging
    res.setHeader('X-DB-Dialect', db.dialect);
    res.setHeader('X-Row-Count', String(rowCount ?? limited.length ?? 0));
    res.setHeader('X-Elapsed-ms', String(ms));

    return res.json(limited);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

(async () => {
  db = await getDb(); // same bootstrap as your STDIO server
  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on http://localhost:${PORT}`);
  });
})();

process.on('SIGINT', async () => {
  await db?.close?.();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await db?.close?.();
  process.exit(0);
});
