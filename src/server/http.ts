import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";

import { loadDbRegistryFromYaml } from "../db/registry.js";
import { mapNamedToDriver } from "../db/paramMap.js";
import type { DB } from "../db/provider.js";
import type { DbAliasMeta } from "../db/registry.js";

// MCP additions
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerSqlTools } from "../tools/sql/index.js";

const app = express();

// Global JSON for your normal REST endpoints.
// We will pass req.body to MCP transport so it's safe to keep this.
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8787);

type Row = Record<string, any>;
let registry: Map<string, DB> = new Map();
let meta: Map<string, DbAliasMeta> = new Map();
let closeAll: () => Promise<void> = async () => {};

// health
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// List DB names (unique, sorted)
app.get("/dbs", (_req, res) => {
  const names = Array.from(
    new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  res.json(names);
});

// List all DB types available
app.get("/dbs/types", (_req, res) => {
  const types = Array.from(
    new Set(Array.from(meta.values()).map(m => m.dialect))
  ).sort();
  res.json(types);
});

// List all DB aliases (exact alias keys)
app.get("/dbs/aliases", (_req, res) => {
  res.json(Array.from(registry.keys()).sort());
});

// List all DB names, grouped by type
app.get("/dbs/list-by-type", (_req, res) => {
  const grouped: Record<string, string[]> = {};
  for (const info of meta.values()) {
    (grouped[info.dialect] ??= []).push(info.databaseName);
  }
  for (const t of Object.keys(grouped)) {
    grouped[t] = Array.from(new Set(grouped[t])).sort((a, b) => a.localeCompare(b));
  }
  res.json(grouped);
});

// POST /sql/query
app.post("/sql/query", async (req, res) => {
  try {
    const {
      db: nameOrAlias,
      type,                      // NEW: optional dialect to disambiguate by name
      sql,
      params = {},
      readOnly = true,
      rowLimit = 1000,
    } = req.body ?? {};

    if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) {
      return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
    }
    if (typeof sql !== "string" || !sql.trim()) {
      return res.status(400).json({ error: "Body 'sql' is required." });
    }

    // 1) Try as alias
    let db = registry.get(nameOrAlias);
    // 2) If not an alias, try resolve as database NAME
    if (!db) {
      const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
      const matches = Array.from(meta.entries())
        .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));

      if (matches.length === 0) {
        return res.status(404).json({
          error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}`,
        });
      }
      if (matches.length > 1) {
        const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
        return res.status(400).json({
          error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql|pg|mssql|oracle|sqlite) or use alias. Candidates: ${hint}`,
        });
      }

      const [alias] = matches[0];
      db = registry.get(alias)!;
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


// MCP server + tools
const mcpServer = new McpServer({ name: "mcp-sql", version: "0.2.0" });
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post('/mcp', async (req, res) => {
  const sessionId = req.header('mcp-session-id') ?? undefined;

  // Case 1: New session → must be 'initialize' without session header
  if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),         // REQUIRED by the SDK types
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        // Optional: mirror your initial block behavior (helpful for some clients)
        res.setHeader('mcp-session-id', sid);
        res.setHeader('Mcp-Session-Id', sid);
      },
      // enableDnsRebindingProtection: true, // optional hardening as in your first block
    });

    // 🔑 MINIMAL CHANGE: connect your existing server (with tools) to THIS transport
    await mcpServer.connect(transport);

    // Let the transport handle the initialize (it will also return the session header)
    return transport.handleRequest(req, res, req.body);
  }

  // Case 2: Existing session → route to its transport
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (!transport) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid or expired mcp-session-id' },
        id: null,
      });
    }
    return transport.handleRequest(req, res, req.body);
  }

  // Otherwise, reject
  return res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Bad Request: No valid session or initialize request' },
    id: null,
  });
});

// GET (SSE) and DELETE use the same per-session routing:
const handleSessionRequest = async (req: any, res: any) => {
  const sessionId = req.header('mcp-session-id') ?? undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) return res.status(400).send('Invalid or missing mcp-session-id');
  return transport.handleRequest(req, res);
};
app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

(async () => {
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const loaded = await loadDbRegistryFromYaml(cfgPath);
  registry = loaded.registry;
  closeAll = loaded.closeAll;
  meta = loaded.meta;

  

  for (const [alias, db] of registry.entries()) {
    registerSqlTools(mcpServer, {
      db,
      auditPath: process.env.SQL_AUDIT_LOG,
      ns: alias,
      meta,
      registry,
    });
  }
  
  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on http://localhost:${PORT}`);

    const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
    const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
    const aliases = Array.from(registry.keys()).sort();

    console.log(`Available DB types:   ${types.join(", ")}`);
    console.log(`Available DB names:   ${names.join(", ")}`);
    console.log(`Available DB aliases: ${aliases.join(", ")}`);
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


