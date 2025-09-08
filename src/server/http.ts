// src/server/http.ts
import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";

import { loadDbRegistryFromYaml } from "../db/registry.js";
import { mapNamedToDriver } from "../db/paramMap.js";
import type { DB } from "../db/provider.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8787);

type Row = Record<string, any>;
let registry: Map<string, DB>;
let closeAll: () => Promise<void>;

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// Helpful: list available DB aliases
app.get("/dbs", (_req: Request, res: Response) => {
  const aliases = Array.from(registry?.keys?.() ?? []);
  res.json(aliases);
});

// POST /sql/query -> { db:"mssql", sql:"...", params?: {...}, readOnly?: true, rowLimit?: 1000 }
app.post("/sql/query", async (req: Request, res: Response) => {
  try {
    const {
      db: alias,
      sql,
      params = {},
      readOnly = true,
      rowLimit = 1000,
    }: {
      db?: unknown;
      sql?: unknown;
      params?: Record<string, any>;
      readOnly?: boolean;
      rowLimit?: number;
    } = req.body ?? {};

    if (typeof alias !== "string" || !alias) {
      return res.status(400).json({ error: "Body 'db' is required (e.g., 'mssql')." });
    }
    if (typeof sql !== "string" || !sql.trim()) {
      return res.status(400).json({ error: "Body 'sql' is required." });
    }
    const db = registry.get(alias);
    if (!db) {
      return res.status(404).json({ error: `Unknown db alias: ${alias}` });
    }
    if (readOnly && !/^\s*select\b/i.test(sql)) {
      return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
    }

    const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
    const t0 = Date.now();
    const { rows, rowCount } = await db.query<Row>(text, mapped);
    const ms = Date.now() - t0;

    const limited: Row[] = Array.isArray(rows)
      ? rows.length > rowLimit
        ? rows.slice(0, rowLimit)
        : rows
      : [];

    res.setHeader("X-DB-Dialect", db.dialect);
    res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
    res.setHeader("X-Elapsed-ms", String(ms));
    return res.json(limited);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

(async () => {
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const loaded = await loadDbRegistryFromYaml(cfgPath);
  registry = loaded.registry;
  closeAll = loaded.closeAll;
  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on http://localhost:${PORT}`);
    console.log(`Available DB aliases: ${Array.from(registry.keys()).join(", ")}`);
  });
})();

process.on("SIGINT", async () => {
  await closeAll?.();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeAll?.();
  process.exit(0);
});
