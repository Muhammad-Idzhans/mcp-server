// import "dotenv/config";
// import express from "express";
// import type { Request, Response } from "express";

// import { loadDbRegistryFromYaml } from "../db/registry.js";
// import { mapNamedToDriver } from "../db/paramMap.js";
// import type { DB } from "../db/provider.js";
// import type { DbAliasMeta } from "../db/registry.js";

// // MCP additions
// import { randomUUID } from "node:crypto";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
// import { registerSqlTools } from "../tools/sql/index.js";

// const app = express();

// // Global JSON for your normal REST endpoints.
// // We will pass req.body to MCP transport so it's safe to keep this.
// app.use(express.json());

// const PORT = Number(process.env.PORT ?? 8787);

// type Row = Record<string, any>;
// let registry: Map<string, DB> = new Map();
// let meta: Map<string, DbAliasMeta> = new Map();
// let closeAll: () => Promise<void> = async () => {};

// // health
// app.get("/health", (_req: Request, res: Response) => {
//   res.status(200).send("ok");
// });

// // List DB names (unique, sorted)
// app.get("/dbs", (_req, res) => {
//   const names = Array.from(
//     new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//   ).sort((a, b) => a.localeCompare(b));
//   res.json(names);
// });

// // List all DB types available
// app.get("/dbs/types", (_req, res) => {
//   const types = Array.from(
//     new Set(Array.from(meta.values()).map(m => m.dialect))
//   ).sort();
//   res.json(types);
// });

// // List all DB aliases (exact alias keys)
// app.get("/dbs/aliases", (_req, res) => {
//   res.json(Array.from(registry.keys()).sort());
// });

// // List all DB names, grouped by type
// app.get("/dbs/list-by-type", (_req, res) => {
//   const grouped: Record<string, string[]> = {};
//   for (const info of meta.values()) {
//     (grouped[info.dialect] ??= []).push(info.databaseName);
//   }
//   for (const t of Object.keys(grouped)) {
//     grouped[t] = Array.from(new Set(grouped[t])).sort((a, b) => a.localeCompare(b));
//   }
//   res.json(grouped);
// });

// // POST /sql/query
// app.post("/sql/query", async (req, res) => {
//   try {
//     const {
//       db: nameOrAlias,
//       type,                      // NEW: optional dialect to disambiguate by name
//       sql,
//       params = {},
//       readOnly = true,
//       rowLimit = 1000,
//     } = req.body ?? {};

//     if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) {
//       return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
//     }
//     if (typeof sql !== "string" || !sql.trim()) {
//       return res.status(400).json({ error: "Body 'sql' is required." });
//     }

//     // 1) Try as alias
//     let db = registry.get(nameOrAlias);
//     // 2) If not an alias, try resolve as database NAME
//     if (!db) {
//       const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
//       const matches = Array.from(meta.entries())
//         .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));

//       if (matches.length === 0) {
//         return res.status(404).json({
//           error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}`,
//         });
//       }
//       if (matches.length > 1) {
//         const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//         return res.status(400).json({
//           error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql|pg|mssql|oracle|sqlite) or use alias. Candidates: ${hint}`,
//         });
//       }

//       const [alias] = matches[0];
//       db = registry.get(alias)!;
//     }

//     if (readOnly && !/^\s*select\b/i.test(sql)) {
//       return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
//     }

//     const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//     const t0 = Date.now();
//     const { rows, rowCount } = await db.query<Row>(text, mapped);
//     const ms = Date.now() - t0;

//     const limited: Row[] = Array.isArray(rows)
//       ? rows.length > rowLimit
//         ? rows.slice(0, rowLimit)
//         : rows
//       : [];

//     res.setHeader("X-DB-Dialect", db.dialect);
//     res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
//     res.setHeader("X-Elapsed-ms", String(ms));
//     return res.json(limited);
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });


// // MCP server + tools
// const mcpServer = new McpServer({ name: "mcp-sql", version: "0.2.0" });
// const transports = new Map<string, StreamableHTTPServerTransport>();

// app.post('/mcp', async (req, res) => {
//   const sessionId = req.header('mcp-session-id') ?? undefined;

//   // Case 1: New session → must be 'initialize' without session header
//   if (!sessionId && isInitializeRequest(req.body)) {
//     const transport = new StreamableHTTPServerTransport({
//       sessionIdGenerator: () => randomUUID(),         // REQUIRED by the SDK types
//       onsessioninitialized: (sid) => {
//         transports.set(sid, transport);
//         // Optional: mirror your initial block behavior (helpful for some clients)
//         res.setHeader('mcp-session-id', sid);
//         res.setHeader('Mcp-Session-Id', sid);
//       },
//       // enableDnsRebindingProtection: true, // optional hardening as in your first block
//     });

//     // 🔑 MINIMAL CHANGE: connect your existing server (with tools) to THIS transport
//     await mcpServer.connect(transport);

//     // Let the transport handle the initialize (it will also return the session header)
//     return transport.handleRequest(req, res, req.body);
//   }

//   // Case 2: Existing session → route to its transport
//   if (sessionId) {
//     const transport = transports.get(sessionId);
//     if (!transport) {
//       return res.status(400).json({
//         jsonrpc: '2.0',
//         error: { code: -32000, message: 'Bad Request: Invalid or expired mcp-session-id' },
//         id: null,
//       });
//     }
//     return transport.handleRequest(req, res, req.body);
//   }

//   // Otherwise, reject
//   return res.status(400).json({
//     jsonrpc: '2.0',
//     error: { code: -32000, message: 'Bad Request: No valid session or initialize request' },
//     id: null,
//   });
// });

// // GET (SSE) and DELETE use the same per-session routing:
// const handleSessionRequest = async (req: any, res: any) => {
//   const sessionId = req.header('mcp-session-id') ?? undefined;
//   const transport = sessionId ? transports.get(sessionId) : undefined;
//   if (!transport) return res.status(400).send('Invalid or missing mcp-session-id');
//   return transport.handleRequest(req, res);
// };
// app.get('/mcp', handleSessionRequest);
// app.delete('/mcp', handleSessionRequest);

// (async () => {
//   const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
//   const loaded = await loadDbRegistryFromYaml(cfgPath);
//   registry = loaded.registry;
//   closeAll = loaded.closeAll;
//   meta = loaded.meta;

  

//   for (const [alias, db] of registry.entries()) {
//     registerSqlTools(mcpServer, {
//       db,
//       auditPath: process.env.SQL_AUDIT_LOG,
//       ns: alias,
//       meta,
//       registry,
//     });
//   }
  
//   app.listen(PORT, () => {
//     console.log(`HTTP bridge listening on http://localhost:${PORT}`);

//     const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//     const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
//     const aliases = Array.from(registry.keys()).sort();

//     console.log(`Available DB types:   ${types.join(", ")}`);
//     console.log(`Available DB names:   ${names.join(", ")}`);
//     console.log(`Available DB aliases: ${aliases.join(", ")}`);
//   });

// })();

// process.on("SIGINT", async () => {
//   await closeAll?.();
//   process.exit(0);
// });
// process.on("SIGTERM", async () => {
//   await closeAll?.();
//   process.exit(0);
// });

















// New changes to support multiple session at the same time
// src/server/http.ts
// import "dotenv/config";
// import express from "express";
// import type { Request, Response } from "express";
// import { loadDbRegistryFromYaml } from "../db/registry.js";
// import { mapNamedToDriver } from "../db/paramMap.js";
// import type { DB } from "../db/provider.js";
// import type { DbAliasMeta } from "../db/registry.js";

// // MCP additions
// import { randomUUID } from "node:crypto";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
// import { registerSqlTools } from "../tools/sql/index.js";

// const app = express();
// // Keep JSON middleware (needed for MCP POST body)
// app.use(express.json());

// const PORT = Number(process.env.PORT ?? 8787);

// type Row = Record<string, any>;
// let registry: Map<string, DB> = new Map();
// let meta: Map<string, DbAliasMeta> = new Map();
// let closeAll: () => Promise<void> = async () => {};

// // health
// app.get("/health", (_req: Request, res: Response) => {
//   res.status(200).send("ok");
// });

// // === Helper routes unchanged ===
// app.get("/dbs", (_req, res) => {
//   const names = Array.from(
//     new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//   ).sort((a, b) => a.localeCompare(b));
//   res.json(names);
// });

// app.get("/dbs/types", (_req, res) => {
//   const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//   res.json(types);
// });

// app.get("/dbs/aliases", (_req, res) => {
//   res.json(Array.from(registry.keys()).sort());
// });

// app.get("/dbs/list-by-type", (_req, res) => {
//   const grouped: Record<string, string[]> = {};
//   for (const info of meta.values()) {
//     (grouped[info.dialect] ??= []).push(info.databaseName);
//   }
//   for (const t of Object.keys(grouped)) {
//     grouped[t] = Array.from(new Set(grouped[t])).sort((a, b) => a.localeCompare(b));
//   }
//   res.json(grouped);
// });

// // === SQL REST endpoint unchanged ===
// app.post("/sql/query", async (req, res) => {
//   try {
//     const {
//       db: nameOrAlias,
//       type,
//       sql,
//       params = {},
//       readOnly = true,
//       rowLimit = 1000,
//     } = req.body ?? {};
//     if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) {
//       return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
//     }
//     if (typeof sql !== "string" || !sql.trim()) {
//       return res.status(400).json({ error: "Body 'sql' is required." });
//     }

//     // 1) Try alias
//     let db = registry.get(nameOrAlias);

//     // 2) Try resolve by database NAME + optional type
//     if (!db) {
//       const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
//       const matches = Array.from(meta.entries())
//         .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));
//       if (matches.length === 0) {
//         return res.status(404).json({
//           error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}`,
//         });
//       }
//       if (matches.length > 1) {
//         const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//         return res.status(400).json({
//           error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql\npg\nmssql\noracle\nsqlite) or use alias. Candidates: ${hint}`,
//         });
//       }
//       const [alias] = matches[0];
//       db = registry.get(alias)!;
//     }

//     if (readOnly && !/^\s*select\b/i.test(sql)) {
//       return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
//     }

//     const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//     const t0 = Date.now();
//     const { rows, rowCount } = await db.query<Row>(text, mapped);
//     const ms = Date.now() - t0;

//     const limited: Row[] = Array.isArray(rows)
//       ? rows.length > rowLimit
//         ? rows.slice(0, rowLimit)
//         : rows
//       : [];

//     res.setHeader("X-DB-Dialect", db.dialect);
//     res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
//     res.setHeader("X-Elapsed-ms", String(ms));
//     return res.json(limited);
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });

// // =====================
// //  MCP: ONE GLOBAL TRANSPORT (Approach A)
// // =====================

// const mcpServer = new McpServer({ name: "mcp-sql", version: "0.2.0" });

// // Create ONE transport at startup and connect once.
// // The transport manages multiple sessions keyed by 'mcp-session-id'.
// const globalTransport = new StreamableHTTPServerTransport({
//   sessionIdGenerator: () => randomUUID(),
//   // No onsessioninitialized needed; the transport will include the session id header
//   // in the initialize response automatically.
// });

// // Log helper (optional)
// function logReq(method: string, req: any) {
//   const sid = req.header?.("mcp-session-id") ?? "(none)";
//   console.log(`[MCP] ${method} sid=${sid} bodyMethod=${req.body?.method ?? "(n/a)"} `);
// }

// // Route ALL /mcp HTTP traffic to the single transport.
// app.post("/mcp", (req, res) => {
//   logReq("POST", req);
//   return globalTransport.handleRequest(req, res, req.body);
// });

// app.get("/mcp", (req, res) => {
//   logReq("GET", req);
//   // keep-alive headers (optional; good for SSE)
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   return globalTransport.handleRequest(req, res);
// });

// app.delete("/mcp", (req, res) => {
//   logReq("DELETE", req);
//   return globalTransport.handleRequest(req, res);
// });

// (async () => {
//   const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
//   const loaded = await loadDbRegistryFromYaml(cfgPath);
//   registry = loaded.registry;
//   closeAll = loaded.closeAll;
//   meta = loaded.meta;

//   // Register SQL tools once per alias
//   for (const [alias, db] of registry.entries()) {
//     registerSqlTools(mcpServer, {
//       db,
//       auditPath: process.env.SQL_AUDIT_LOG,
//       ns: alias,
//       meta,
//       registry,
//     });
//   }

//   // Connect the ONE transport once
//   await mcpServer.connect(globalTransport);

//   app.listen(PORT, () => {
//     console.log(`HTTP bridge listening on http://localhost:${PORT}`);
//     const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//     const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
//     const aliases = Array.from(registry.keys()).sort();
//     console.log(`Available DB types: ${types.join(", ")}`);
//     console.log(`Available DB names: ${names.join(", ")}`);
//     console.log(`Available DB aliases: ${aliases.join(", ")}`);
//     console.log(`[MCP] Single transport mode is ACTIVE (Approach A)`);
//   });
// })();

// process.on("SIGINT", async () => {
//   await closeAll?.();
//   process.exit(0);
// });
// process.on("SIGTERM", async () => {
//   await closeAll?.();
//   process.exit(0);
// });
























// src/server/http.ts
// import "dotenv/config";
// import express from "express";
// import type { Request, Response } from "express";

// import { loadDbRegistryFromYaml } from "../db/registry.js";
// import type { DB } from "../db/provider.js";
// import type { DbAliasMeta } from "../db/registry.js";
// import { mapNamedToDriver } from "../db/paramMap.js";

// // MCP SDK
// import { randomUUID } from "node:crypto";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// // Zod (we'll use Zod *types* as a raw shape, not z.object)
// import { z } from "zod";

// // Optional helpers reused from your tool modules
// import { sqlGuardrails } from "../tools/sql/templates.js";
// import { excludedOracleTables } from "../tools/sql/unwantedOracle.js";

// // ----------------------------------------------------------------------------
// // Express app + JSON
// // ----------------------------------------------------------------------------
// const app = express();
// // Keep JSON middleware (needed for /sql/query and MCP POST bodies)
// app.use(express.json());

// const PORT = Number(process.env.PORT ?? 8787);

// // ----------------------------------------------------------------------------
// type Row = Record<string, any>;
// let registry: Map<string, DB> = new Map();
// let meta: Map<string, DbAliasMeta> = new Map();
// let closeAll: () => Promise<void> = async () => {};

// // ----------------------------------------------------------------------------
// // REST: health + helper discovery endpoints (UNCHANGED)
// // ----------------------------------------------------------------------------
// app.get("/health", (_req: Request, res: Response) => {
//   res.status(200).send("ok");
// });

// app.get("/dbs", (_req, res) => {
//   const names = Array.from(
//     new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//   ).sort((a, b) => a.localeCompare(b));
//   res.json(names);
// });

// app.get("/dbs/types", (_req, res) => {
//   const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//   res.json(types);
// });

// app.get("/dbs/aliases", (_req, res) => {
//   res.json(Array.from(registry.keys()).sort());
// });

// app.get("/dbs/list-by-type", (_req, res) => {
//   const grouped: Record<string, string[]> = {};
//   for (const info of meta.values()) {
//     (grouped[info.dialect] ??= []).push(info.databaseName);
//   }
//   for (const t of Object.keys(grouped)) {
//     grouped[t] = Array.from(new Set(grouped[t])).sort((a, b) => a.localeCompare(b));
//   }
//   res.json(grouped);
// });

// // ----------------------------------------------------------------------------
// // REST: SQL endpoint (UNCHANGED behavior)
// // ----------------------------------------------------------------------------
// app.post("/sql/query", async (req, res) => {
//   try {
//     const {
//       db: nameOrAlias,
//       type,
//       sql,
//       params = {},
//       readOnly = true,
//       rowLimit = 1000,
//     } = req.body ?? {};

//     if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) {
//       return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
//     }
//     if (typeof sql !== "string" || !sql.trim()) {
//       return res.status(400).json({ error: "Body 'sql' is required." });
//     }

//     // 1) Try alias
//     let db = registry.get(nameOrAlias);

//     // 2) Try resolve by database NAME + optional type
//     if (!db) {
//       const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
//       const matches = Array.from(meta.entries())
//         .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));
//       if (matches.length === 0) {
//         return res.status(404).json({
//           error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}`,
//         });
//       }
//       if (matches.length > 1) {
//         const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//         return res.status(400).json({
//           error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql\npg\nmssql\noracle\nsqlite) or use alias. Candidates: ${hint}`,
//         });
//       }
//       const [alias] = matches[0];
//       db = registry.get(alias)!;
//     }

//     if (readOnly && !/^\s*select\b/i.test(sql)) {
//       return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
//     }

//     const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//     const t0 = Date.now();
//     const { rows, rowCount } = await db.query<Row>(text, mapped);
//     const ms = Date.now() - t0;

//     const limited: Row[] = Array.isArray(rows)
//       ? rows.length > rowLimit
//         ? rows.slice(0, rowLimit)
//         : rows
//       : [];

//     res.setHeader("X-DB-Dialect", db.dialect);
//     res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
//     res.setHeader("X-Elapsed-ms", String(ms));
//     return res.json(limited);
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });

// // ============================================================================
// // MCP: multi-client over HTTP — one server+transport PER SESSION
// // ============================================================================
// type Session = {
//   server: McpServer;
//   transport: StreamableHTTPServerTransport;
//   createdAt: number;
//   lastSeenAt: number;
// };
// const sessions = new Map<string, Session>();

// const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 30 * 60 * 1000); // 30 minutes default
// const EVICT_EVERY_MS = 60 * 1000; // sweep every minute

// function logReq(method: string, req: Request) {
//   const sid = req.header?.("mcp-session-id") ?? "(none)";
//   const bodyMethod = (req as any).body?.method ?? "(n/a)";
//   console.log(`[MCP] ${method} sid=${sid} bodyMethod=${bodyMethod}`);
// }

// // ---------- Helpers used by namespaced SQL tools ----------
// function toMarkdown(rows: any[]) {
//   if (!rows?.length) return "_(no rows)_";
//   const headers = Object.keys(rows[0]);
//   const top = `${headers.join(" | ")}\n`;
//   const sep = `${headers.map(() => "---").join(" | ")}\n`;
//   const body = rows.map(r => `${headers.map(h => fmt(r[h])).join(" | ")}`).join("\n");
//   return [top, sep, body].join("");
// }
// function fmt(v: unknown) {
//   if (v === null || v === undefined) return "";
//   if (typeof v === "object") return "```json\n" + JSON.stringify(v) + "\n```";
//   return String(v);
// }
// function quoteIdent(dialect: DB["dialect"], ident: string) {
//   switch (dialect) {
//     case "pg":
//     case "oracle":
//     case "sqlite": {
//       const safe = ident.replace(/"/g, '""');
//       return `"${safe}"`;
//     }
//     case "mysql": {
//       const safe = ident.replace(/`/g, "``");
//       return `\`${safe}\``;
//     }
//     case "mssql": {
//       const safe = ident.replace(/]/g, "]]");
//       return `[${safe}]`;
//     }
//   }
// }
// function quoteMaybeQualified(dialect: DB["dialect"], ident: string) {
//   if (ident.includes(".")) {
//     const [schema, name] = ident.split(".");
//     return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name)}`;
//   }
//   return quoteIdent(dialect, ident);
// }
// async function listTables(dbX: DB): Promise<string[]> {
//   switch (dbX.dialect) {
//     case "pg": {
//       const sql = `
//         SELECT table_name
//         FROM information_schema.tables
//         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
//         ORDER BY table_name`;
//       const { rows } = await dbX.query<{ table_name: string }>(sql, []);
//       return rows.map(r => r.table_name);
//     }
//     case "mysql": {
//       const sql = `
//         SELECT TABLE_NAME AS table_name
//         FROM information_schema.tables
//         WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
//         ORDER BY TABLE_NAME`;
//       const { rows } = await dbX.query<{ table_name: string }>(sql, []);
//       return rows.map(r => r.table_name);
//     }
//     case "mssql": {
//       const sql = `
//         SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
//         FROM INFORMATION_SCHEMA.TABLES
//         WHERE TABLE_TYPE = 'BASE TABLE'
//         ORDER BY TABLE_SCHEMA, TABLE_NAME`;
//       const { rows } = await dbX.query<{ table_schema: string; table_name: string }>(sql, []);
//       return rows.map(r => r.table_name);
//     }
//     case "oracle": {
//       const quoted = excludedOracleTables.map(name => `'${name.toUpperCase()}'`).join(", ");
//       const sql = `
//         SELECT table_name AS "table_name"
//         FROM user_tables
//         WHERE temporary = 'N'
//           AND table_name NOT LIKE 'ROLLING$%'
//           AND table_name NOT LIKE 'SCHEDULER_%'
//           ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
//           AND table_name NOT IN (SELECT object_name FROM user_recyclebin)
//         ORDER BY table_name`;
//       const { rows } = await dbX.query<{ table_name: string }>(sql, []);
//       return rows.map(r => r.table_name);
//     }
//     case "sqlite": {
//       const sql = `
//         SELECT name AS table_name
//         FROM sqlite_master
//         WHERE type='table' AND name NOT LIKE 'sqlite_%'
//         ORDER BY name`;
//       const { rows } = await dbX.query<{ table_name: string }>(sql, []);
//       return rows.map(r => r.table_name);
//     }
//   }
// }
// async function dumpTables(dbX: DB, tables: string[], maxRows: number) {
//   const result: { table: string; rows: any[] }[] = [];
//   for (const t of tables) {
//     const qTable = quoteMaybeQualified(dbX.dialect, t);
//     let sql: string;
//     switch (dbX.dialect) {
//       case "pg":
//       case "mysql":
//       case "sqlite":
//         sql = `SELECT * FROM ${qTable} LIMIT :n`;
//         break;
//       case "mssql":
//         sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`;
//         break;
//       case "oracle":
//         sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`;
//         break;
//     }
//     const { text, params } =
//       dbX.dialect === "mssql"
//         ? { text: sql, params: [] as any[] }
//         : mapNamedToDriver(sql, { n: maxRows }, dbX.dialect);
//     const { rows } = await dbX.query<any>(text, params);
//     result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
//   }
//   return result;
// }
// async function describeViaQuery<T extends Record<string, any>>(
//   dbX: DB,
//   sql: string,
//   tableKey: string,
//   columnKey: string,
//   typeKey: string
// ): Promise<string> {
//   const { rows } = await dbX.query<T>(sql, []);
//   const m = new Map<string, string[]>();
//   for (const r of rows) {
//     const t = r[tableKey];
//     const c = r[columnKey];
//     const d = r[typeKey];
//     if (!t || !c) continue;
//     const list = m.get(t) ?? [];
//     list.push(`${c} ${d ?? ""}`.trim());
//     m.set(t, list);
//   }
//   return [...m.entries()]
//     .map(([t, cols]) => `### ${t}\n- ${cols.join("\n- ")}`)
//     .join("\n\n") || "_(no tables)_";
// }
// async function describeSchema(dbX: DB) {
//   const tables = await listTables(dbX);
//   const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
//   if (!safeTables.length) return "_(no tables)_";

//   switch (dbX.dialect) {
//     case "pg": {
//       const inList = safeTables.map(t => `'${t}'`).join(", ");
//       const sql = `
//         SELECT table_name, column_name, data_type
//         FROM information_schema.columns
//         WHERE table_schema = 'public' AND table_name IN (${inList})
//         ORDER BY table_name, ordinal_position`;
//       return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//     }
//     case "mysql": {
//       const inList = safeTables.map(t => `'${t}'`).join(", ");
//       const sql = `
//         SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//         FROM information_schema.columns
//         WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
//         ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//       return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//     }
//     case "mssql": {
//       const q = safeTables.map(t => {
//         if (t.includes(".")) {
//           const [schema, name] = t.split(".");
//           return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
//         }
//         return { schema: null as string | null, name: t.replace(/'/g, "''") };
//       });
//       const hasSchema = q.some(x => !!x.schema);
//       let sql: string;
//       if (hasSchema) {
//         const orConds = q
//           .map(x =>
//             x.schema
//               ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
//               : `(TABLE_NAME = '${x.name}')`
//           )
//           .join(" OR ");
//         sql = `
//           SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//           FROM INFORMATION_SCHEMA.COLUMNS
//           WHERE ${orConds}
//           ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
//       } else {
//         const inList = q.map(x => `'${x.name}'`).join(", ");
//         sql = `
//           SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//           FROM INFORMATION_SCHEMA.COLUMNS
//           WHERE TABLE_NAME IN (${inList})
//           ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//       }
//       return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//     }
//     case "oracle": {
//       const inList = safeTables.map(t => `'${t.toUpperCase()}'`).join(", ");
//       const sql = `
//         SELECT
//           table_name AS "table_name",
//           column_name AS "column_name",
//           CASE
//             WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR','NCHAR') AND data_length IS NOT NULL
//               THEN data_type || '(' || data_length || ')'
//             WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL
//               THEN data_type || '(' || data_precision || NVL2(data_scale, ',' || data_scale, '') || ')'
//             ELSE data_type
//           END AS "data_type"
//         FROM user_tab_columns
//         WHERE UPPER(table_name) IN (${inList})
//         ORDER BY table_name, column_id`;
//       return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//     }
//     case "sqlite": {
//       const parts: string[] = [];
//       for (const t of safeTables) {
//         const pragma = `PRAGMA table_info(${quoteIdent(dbX.dialect, t)});`;
//         const { rows } = await dbX.query<{ name: string; type: string }>(pragma, []);
//         if (!rows?.length) continue;
//         const body = rows.map(r => `- ${r.name} \`${r.type}\``).join("\n");
//         parts.push(`## ${t}\n\n${body}`);
//       }
//       return parts.join("\n\n") || "_(no tables)_";
//     }
//   }
// }

// // ---------- Tool registration per session ----------

// function registerDbDiscoveryTools(server: McpServer) {
//   // db.aliases
//   server.registerTool(
//     "db.aliases",
//     {
//       title: "List database aliases",
//       description:
//         "Return the list of available database aliases on this server (e.g., mysql, mssql, pg, oracle).",
//       inputSchema: {}, // ZodRawShape (empty)
//     },
//     async (_args, _extra) => {
//       const aliases = Array.from(registry.keys()).sort();
//       return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
//     }
//   );

//   // db.types
//   server.registerTool(
//     "db.types",
//     {
//       title: "List available database (types)",
//       description: "List available database dialects (types), e.g., MySQL, PostgreSQL, MSSQL, Oracle.",
//       inputSchema: {}, // ZodRawShape
//     },
//     async (_args, _extra) => {
//       const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//       return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
//     }
//   );

//   // db.names
//   server.registerTool(
//     "db.names",
//     {
//       title: "List database names",
//       description: "List database names (not aliases) across all configured databases (unique, sorted).",
//       inputSchema: {}, // ZodRawShape
//     },
//     async (_args, _extra) => {
//       const names = Array.from(
//         new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//       ).sort((a, b) => a.localeCompare(b));
//       return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//     }
//   );

//   // db.listByType
//   server.registerTool(
//     "db.listByType",
//     {
//       title: "List databases by type",
//       description:
//         "List database names for a given dialect. unique=true returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
//       // ZodRawShape (plain object of Zod types)
//       inputSchema: {
//         type: z
//           .string()
//           .min(1)
//           .describe("Dialect: mysql\npg\nmssql\noracle\nsqlite"),
//         unique: z.boolean().default(true),
//         includeAliases: z.boolean().default(false),
//       },
//     },
//     async (args, _extra) => {
//       const dialect = String(args?.type ?? "").trim();
//       const unique = args?.unique ?? true;
//       const includeAliases = args?.includeAliases ?? false;

//       if (!dialect) {
//         return {
//           isError: true,
//           content: [{ type: "text", text: JSON.stringify({ error: "Missing required 'type'." }) }],
//         };
//       }

//       const items = Array.from(meta.values()).filter(m => m.dialect === dialect);
//       if (unique) {
//         const names = Array.from(new Set(items.map(i => i.databaseName).filter(Boolean))).sort((a, b) =>
//           a.localeCompare(b)
//         );
//         return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//       }

//       const rows = items
//         .map(i => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
//         .sort(
//           (a: any, b: any) =>
//             String(a.name).localeCompare(String(b.name)) ||
//             (a.alias !== undefined && b.alias !== undefined
//               ? String(a.alias).localeCompare(String(b.alias))
//               : 0)
//         );
//       return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
//     }
//   );
// }

// function registerSessionSqlTools(server: McpServer, ns: string, db: DB) {
//   const name = (base: string) => `${ns}.${base}`;

//   // <alias>.sql.peek
//   server.registerTool(
//     name("sql.peek"),
//     {
//       title: "Peek into database content",
//       description: [
//         "Return up to N rows from each base table in the chosen database.",
//         "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
//         "This tool is bound to the DB alias in its name.",
//       ].join("\n"),
//       inputSchema: {
//         maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
//         as: z.enum(["markdown", "json"]).default("markdown"),
//       },
//     },
//     async ({ maxRowsPerTable, as }, _extra) => {
//       const tables = await listTables(db);
//       const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
//       if (!safeTables.length) {
//         return { content: [{ type: "text", text: as === "json" ? "[]" : "_(no tables)_" }] };
//       }
//       const dump = await dumpTables(db, safeTables, maxRowsPerTable);
//       if (as === "json") {
//         return { content: [{ type: "text", text: JSON.stringify(dump, null, 2) }] };
//       }
//       const md = dump.map(({ table, rows }) => `## ${table}\n\n${toMarkdown(rows)}`).join("\n\n");
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

//   // <alias>.sql.schema
//   server.registerTool(
//     name("sql.schema"),
//     {
//       title: "Describe schema",
//       description: [
//         "Return a compact Markdown outline of tables and columns for the chosen database.",
//         "This tool is bound to the DB alias in its name.",
//       ].join("\n"),
//       inputSchema: {}, // empty ZodRawShape
//     },
//     async (_args, _extra) => {
//       const md = await describeSchema(db);
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

//   // <alias>.sql.query
//   server.registerTool(
//     name("sql.query"),
//     {
//       title: "Execute SQL",
//       description: [
//         "Execute a parameterized SQL query against the chosen database.",
//         "",
//         "**Usage Tips:**",
//         sqlGuardrails(),
//       ].join("\n"),
//       inputSchema: {
//         sql: z.string(),
//         params: z.record(z.any()).default({}).optional(),
//         readOnly: z.boolean().default(true).optional(),
//         rowLimit: z.number().int().min(1).max(10000).default(1000).optional(),
//         as: z.enum(["json", "markdown"]).default("json").optional(),
//       },
//     },
//     async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }, _extra) => {
//       if (readOnly && !/^\s*select\b/i.test(sql)) {
//         throw new Error("readOnly mode: only SELECT is allowed.");
//       }
//       const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//       const t0 = Date.now();
//       const { rows, rowCount } = await db.query(text, mapped);
//       const ms = Date.now() - t0;

//       const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
//       console.log(`[SQL] ${ns} dialect=${db.dialect} rows=${rowCount ?? limited?.length ?? 0} ms=${ms}`);

//       if (as === "markdown") {
//         return { content: [{ type: "text", text: toMarkdown(limited) }] };
//       }
//       return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
//     }
//   );
// }

// // ---------- Session lifecycle: create + route + cleanup ----------
// async function createSession(): Promise<StreamableHTTPServerTransport> {
//   // 1) New server per session
//   const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });

//   // 2) Register discovery tools (per session)
//   registerDbDiscoveryTools(server);

//   // 3) Register namespaced SQL tools for each alias (per session)
//   for (const [alias, db] of registry.entries()) {
//     registerSessionSqlTools(server, alias, db);
//   }

//   // 4) Transport per session
//   const transport = new StreamableHTTPServerTransport({
//     sessionIdGenerator: () => randomUUID(),
//     onsessioninitialized: (sid: string) => {
//       sessions.set(sid, {
//         server,
//         transport,
//         createdAt: Date.now(),
//         lastSeenAt: Date.now(),
//       });
//       console.log(`[MCP] session initialized: ${sid}`);
//     },
//   });

//   // 5) Wire server to transport
//   await server.connect(transport);
//   return transport;
// }

// function requireSession(req: Request, res: Response): { sid: string; s?: Session } | null {
//   const sid = req.header("mcp-session-id") ?? "";
//   if (!sid) {
//     res.status(400).send("Invalid or missing mcp-session-id");
//     return null;
//   }
//   return { sid, s: sessions.get(sid) };
// }

// function touch(sid: string) {
//   const s = sessions.get(sid);
//   if (s) s.lastSeenAt = Date.now();
// }

// // POST /mcp — initialize (no header) OR route to an existing session (with header)
// app.post("/mcp", async (req, res) => {
//   logReq("POST", req);
//   const hasSid = !!req.header("mcp-session-id");

//   // Case 1: New session initialize (no header + initialize)
//   if (!hasSid && isInitializeRequest((req as any).body)) {
//     const transport = await createSession();
//     // Transport handles initialize and includes 'mcp-session-id' in headers
//     return transport.handleRequest(req as any, res as any, (req as any).body);
//   }

//   // Case 2: Existing session — route to its transport
//   if (hasSid) {
//     const sid = req.header("mcp-session-id")!;
//     const sess = sessions.get(sid);
//     if (!sess) {
//       return res.status(400).json({
//         jsonrpc: "2.0",
//         error: { code: -32000, message: "Bad Request: Invalid or expired mcp-session-id" },
//         id: null,
//       });
//     }
//     touch(sid);
//     return sess.transport.handleRequest(req as any, res as any, (req as any).body);
//   }

//   // Otherwise
//   return res.status(400).json({
//     jsonrpc: "2.0",
//     error: { code: -32000, message: "Bad Request: No valid session or initialize request" },
//     id: null,
//   });
// });

// // GET /mcp — SSE stream for a specific session
// app.get("/mcp", (req, res) => {
//   logReq("GET", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;

//   // Streaming-friendly headers
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   // res.setHeader("Content-Type", "text/event-stream"); // optional

//   touch(sid);
//   return s.transport.handleRequest(req as any, res as any);
// });

// // DELETE /mcp — end a session
// app.delete("/mcp", async (req, res) => {
//   logReq("DELETE", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;

//   await s.transport.handleRequest(req as any, res as any);
//   sessions.delete(sid);
//   console.log(`[MCP] session deleted: ${sid}`);
// });

// // Idle session eviction (optional)
// setInterval(() => {
//   if (SESSION_TTL_MS <= 0) return;
//   const now = Date.now();
//   for (const [sid, s] of sessions) {
//     if (now - s.lastSeenAt > SESSION_TTL_MS) {
//       sessions.delete(sid);
//       console.log(`[MCP] session evicted (idle): ${sid}`);
//     }
//   }
// }, EVICT_EVERY_MS);

// // ----------------------------------------------------------------------------
// // Boot: load DB registry, then start HTTP server
// // ----------------------------------------------------------------------------
// (async () => {
//   const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
//   const loaded = await loadDbRegistryFromYaml(cfgPath);
//   registry = loaded.registry;
//   closeAll = loaded.closeAll;
//   meta = loaded.meta;

//   app.listen(PORT, () => {
//     console.log(`HTTP bridge listening on http://localhost:${PORT}`);
//     const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//     const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
//     const aliases = Array.from(registry.keys()).sort();
//     console.log(`Available DB types: ${types.join(", ")}`);
//     console.log(`Available DB names: ${names.join(", ")}`);
//     console.log(`Available DB aliases: ${aliases.join(", ")}`);
//     console.log(`[MCP] Per-session server+transport mode is ACTIVE`);
//   });
// })();

// // ----------------------------------------------------------------------------
// // Graceful shutdown
// // ----------------------------------------------------------------------------
// process.on("SIGINT", async () => {
//   await closeAll?.();
//   process.exit(0);
// });
// process.on("SIGTERM", async () => {
//   await closeAll?.();
//   process.exit(0);
// });



















// src/server/http.ts
// import "dotenv/config";
// import express from "express";
// import type { Request, Response } from "express";

// import { loadDbRegistryFromYaml } from "../db/registry.js";
// import type { DB } from "../db/provider.js";
// import type { DbAliasMeta } from "../db/registry.js";
// import { mapNamedToDriver } from "../db/paramMap.js";

// import { randomUUID } from "node:crypto";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// // ✅ Use your tool registrar again (now made per‑session safe in patch #2)
// import { registerSqlTools } from "../tools/sql/index.js";

// const app = express();
// app.use(express.json());

// const PORT = Number(process.env.PORT ?? 8787);

// // ---------- DB registry state ----------
// type Row = Record<string, any>;
// let registry: Map<string, DB> = new Map();
// let meta: Map<string, DbAliasMeta> = new Map();
// let closeAll: () => Promise<void> = async () => {};

// // ---------- REST endpoints (unchanged) ----------
// app.get("/health", (_req, res) => res.status(200).send("ok"));

// app.get("/dbs", (_req, res) => {
//   const names = Array.from(
//     new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//   ).sort((a, b) => a.localeCompare(b));
//   res.json(names);
// });

// app.get("/dbs/types", (_req, res) => {
//   const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//   res.json(types);
// });

// app.get("/dbs/aliases", (_req, res) => {
//   res.json(Array.from(registry.keys()).sort());
// });

// app.get("/dbs/list-by-type", (_req, res) => {
//   const grouped: Record<string, string[]> = {};
//   for (const info of meta.values()) {
//     (grouped[info.dialect] ??= []).push(info.databaseName);
//   }
//   for (const t of Object.keys(grouped)) {
//     grouped[t] = Array.from(new Set(grouped[t])).sort((a, b) => a.localeCompare(b));
//   }
//   res.json(grouped);
// });

// app.post("/sql/query", async (req, res) => {
//   try {
//     const {
//       db: nameOrAlias,
//       type,
//       sql,
//       params = {},
//       readOnly = true,
//       rowLimit = 1000,
//     } = req.body ?? {};

//     if (typeof nameOrAlias !== "string" || !nameOrAlias.trim()) {
//       return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
//     }
//     if (typeof sql !== "string" || !sql.trim()) {
//       return res.status(400).json({ error: "Body 'sql' is required." });
//     }

//     // 1) Try alias
//     let db = registry.get(nameOrAlias);

//     // 2) Try resolve by database NAME + optional type
//     if (!db) {
//       const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
//       const matches = Array.from(meta.entries())
//         .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));
//       if (matches.length === 0) {
//         return res.status(404).json({
//           error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}`,
//         });
//       }
//       if (matches.length > 1) {
//         const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//         return res.status(400).json({
//           error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql\npg\nmssql\noracle\nsqlite) or use alias. Candidates: ${hint}`,
//         });
//       }
//       const [alias] = matches[0];
//       db = registry.get(alias)!;
//     }

//     if (readOnly && !/^\s*select\b/i.test(sql)) {
//       return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
//     }

//     const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//     const t0 = Date.now();
//     const { rows, rowCount } = await db.query<Row>(text, mapped);
//     const ms = Date.now() - t0;

//     const limited: Row[] = Array.isArray(rows)
//       ? rows.length > rowLimit
//         ? rows.slice(0, rowLimit)
//         : rows
//       : [];

//     res.setHeader("X-DB-Dialect", db.dialect);
//     res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
//     res.setHeader("X-Elapsed-ms", String(ms));
//     return res.json(limited);
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });

// // ---------- MCP per-session server+transport ----------
// type Session = {
//   server: McpServer;
//   transport: StreamableHTTPServerTransport;
//   createdAt: number;
//   lastSeenAt: number;
// };
// const sessions = new Map<string, Session>();

// const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 30 * 60 * 1000);
// const EVICT_EVERY_MS = 60 * 1000;

// function logReq(method: string, req: Request) {
//   const sid = req.header?.("mcp-session-id") ?? "(none)";
//   const bodyMethod = (req as any).body?.method ?? "(n/a)";
//   console.log(`[MCP] ${method} sid=${sid} bodyMethod=${bodyMethod}`);
// }

// async function createSession(): Promise<StreamableHTTPServerTransport> {
//   const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });

//   // ✅ Register discovery + namespaced SQL tools for THIS session
//   for (const [alias, db] of registry.entries()) {
//     registerSqlTools(server, { db, auditPath: process.env.SQL_AUDIT_LOG, ns: alias, meta, registry });
//   }

//   const transport = new StreamableHTTPServerTransport({
//     sessionIdGenerator: () => randomUUID(),
//     onsessioninitialized: (sid: string) => {
//       sessions.set(sid, { server, transport, createdAt: Date.now(), lastSeenAt: Date.now() });
//       console.log(`[MCP] session initialized: ${sid}`);
//     },
//   });

//   await server.connect(transport);
//   return transport;
// }

// function requireSession(req: Request, res: Response): { sid: string; s?: Session } | null {
//   const sid = req.header("mcp-session-id") ?? "";
//   if (!sid) {
//     res.status(400).send("Invalid or missing mcp-session-id");
//     return null;
//   }
//   return { sid, s: sessions.get(sid) };
// }

// function touch(sid: string) {
//   const s = sessions.get(sid);
//   if (s) s.lastSeenAt = Date.now();
// }

// app.post("/mcp", async (req, res) => {
//   logReq("POST", req);
//   const hasSid = !!req.header("mcp-session-id");

//   if (!hasSid && isInitializeRequest((req as any).body)) {
//     const transport = await createSession();
//     return transport.handleRequest(req as any, res as any, (req as any).body);
//   }

//   if (hasSid) {
//     const sid = req.header("mcp-session-id")!;
//     const sess = sessions.get(sid);
//     if (!sess) {
//       return res.status(400).json({
//         jsonrpc: "2.0",
//         error: { code: -32000, message: "Bad Request: Invalid or expired mcp-session-id" },
//         id: null,
//       });
//     }
//     touch(sid);
//     return sess.transport.handleRequest(req as any, res as any, (req as any).body);
//   }

//   return res.status(400).json({
//     jsonrpc: "2.0",
//     error: { code: -32000, message: "Bad Request: No valid session or initialize request" },
//     id: null,
//   });
// });

// app.get("/mcp", (req, res) => {
//   logReq("GET", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;

//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   touch(sid);
//   return s.transport.handleRequest(req as any, res as any);
// });

// app.delete("/mcp", async (req, res) => {
//   logReq("DELETE", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;
//   await s.transport.handleRequest(req as any, res as any);
//   sessions.delete(sid);
//   console.log(`[MCP] session deleted: ${sid}`);
// });

// setInterval(() => {
//   if (SESSION_TTL_MS <= 0) return;
//   const now = Date.now();
//   for (const [sid, s] of sessions) {
//     if (now - s.lastSeenAt > SESSION_TTL_MS) {
//       sessions.delete(sid);
//       console.log(`[MCP] session evicted (idle): ${sid}`);
//     }
//   }
// }, EVICT_EVERY_MS);

// // ---------- Boot ----------
// (async () => {
//   const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
//   const loaded = await loadDbRegistryFromYaml(cfgPath);
//   registry = loaded.registry;
//   closeAll = loaded.closeAll;
//   meta = loaded.meta;

//   app.listen(PORT, () => {
//     console.log(`HTTP bridge listening on http://localhost:${PORT}`);
//     const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//     const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
//     const aliases = Array.from(registry.keys()).sort();
//     console.log(`Available DB types: ${types.join(", ")}`);
//     console.log(`Available DB names: ${names.join(", ")}`);
//     console.log(`Available DB aliases: ${aliases.join(", ")}`);
//     console.log(`[MCP] Per-session server+transport mode is ACTIVE`);
//   });
// })();

// process.on("SIGINT", async () => { await closeAll?.(); process.exit(0); });
// process.on("SIGTERM", async () => { await closeAll?.(); process.exit(0); });






























import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import { loadDbRegistryFromYaml } from "../db/registry.js";
import type { DB } from "../db/provider.js";
import type { DbAliasMeta } from "../db/registry.js";
import { mapNamedToDriver } from "../db/paramMap.js";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerSqlTools } from "../tools/sql/index.js";
// NEW: RBAC policy
import { evaluatePolicyFromFile } from "../policy/index.js";
import { evaluateToolsPolicyFromFile } from "../policy/index.js";

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT ?? 8787);

// ---------- DB registry state ----------
type Row = Record<string, any>;
let registry: Map<string, DB> = new Map();
let meta: Map<string, DbAliasMeta> = new Map();
let closeAll: () => Promise<void> = async () => {};

// ---------- Helper: log ----------
function logReq(method: string, req: Request) {
  const sid = req.header?.("mcp-session-id") ?? "(none)";
  const bodyMethod = (req as any).body?.method ?? "(n/a)";
  console.log(`[MCP] ${method} sid=${sid} bodyMethod=${bodyMethod}`);
}

// ---------- Session with RBAC ----------
type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
  // NEW: user & allowed aliases
  user: { id?: string; roles: string[] };
  allowedAliases: string[];
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 30 * 60 * 1000);
const EVICT_EVERY_MS = 60 * 1000;

// DEV helper to read roles from request header X-Role
function rolesFromReq(req: Request): string[] {
  const raw = req.header("x-role") ?? "";
  const roles = raw.split(",").map(s => s.trim()).filter(Boolean);
  return roles.length ? roles : ["admin"]; // default for dev
}

function requireSession(req: Request, res: Response): { sid: string; s?: Session } | null {
  const sid = req.header("mcp-session-id") ?? "";
  if (!sid) {
    res.status(400).send("Invalid or missing mcp-session-id");
    return null;
  }
  return { sid, s: sessions.get(sid) };
}

function touch(sid: string) {
  const s = sessions.get(sid);
  if (s) s.lastSeenAt = Date.now();
}

// Create a session restricted to allowed aliases
async function createSession(req: Request): Promise<StreamableHTTPServerTransport> {
  const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });

  // Which aliases this user can access
  const roles = rolesFromReq(req);
  const allAliases = Array.from(registry.keys());
  const policyPath = process.env.POLICY_FILE ?? "./policies.yaml";
  const { allowedAliases } = evaluatePolicyFromFile(policyPath, { roles, allAliases });

  // Per-alias tool + data policy (tools + readOnly + tableAllow + rowFilters)
  const policies = evaluateToolsPolicyFromFile(policyPath, { roles, aliases: allowedAliases });

  // Discovery tools: admin-only when X-Role is present; open when no role header
  const hasRoleHeader = !!req.header("x-role");
  const isAdmin = roles.includes("admin");
  const discoveryVisible = hasRoleHeader ? isAdmin : true;

  // User identity (for :user_id in rowFilters); later you can source this from JWT claims
  const userId = req.header("x-user-id") ?? undefined;

  // Register aliases with the policy and user context
  for (const alias of allowedAliases) {
    const db = registry.get(alias)!;
    const p = policies[alias]; // may be undefined (=> all tools, no filters)
    // Apply row-level policy only when role header exists and user isn't admin
    const applyDataPolicy = hasRoleHeader && !isAdmin && !!p;

    registerSqlTools(server, {
      db,
      auditPath: process.env.SQL_AUDIT_LOG,
      ns: alias,
      meta,
      registry,
      tools: p ? p.tools : undefined,  // show/hide sql.schema/peek/query
      dataPolicy: applyDataPolicy
        ? { readOnly: p!.readOnly, tableAllow: p!.tableAllow, rowFilters: p!.rowFilters }
        : undefined,
      userContext: applyDataPolicy ? { user_id: userId } : undefined,
      discoveryVisible, // keep discovery admin-only when role header present
    });
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid: string) => {
      sessions.set(sid, {
        server,
        transport,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        user: { roles },
        allowedAliases,
      });
      console.log(`[MCP] session initialized: ${sid}, roles=${roles.join("|")}, aliases=${allowedAliases.join("|")}`);
    },
  });

  await server.connect(transport);
  return transport;
}


// ---------- REST endpoints ----------
app.get("/health", (_req, res) => res.status(200).send("ok"));

app.get("/dbs", (_req, res) => {
  const names = Array.from(
    new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  res.json(names);
});

app.get("/dbs/types", (_req, res) => {
  const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
  res.json(types);
});

app.get("/dbs/aliases", (_req, res) => {
  res.json(Array.from(registry.keys()).sort());
});

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

app.post("/sql/query", async (req, res) => {
  try {
    const {
      db: nameOrAlias,
      type,
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

    // Determine allowed aliases for this request
    let allowedAliases: string[] = Array.from(registry.keys()); // default (dev)
    const sid = req.header("mcp-session-id");
    if (sid && sessions.has(sid)) {
      allowedAliases = sessions.get(sid)!.allowedAliases;
    } else if ((process.env.DEV_ALLOW_HEADER_ROLE ?? "1") === "1") {
      const roles = rolesFromReq(req);
      const policyPath = process.env.POLICY_FILE ?? "./policies.yaml";
      allowedAliases = evaluatePolicyFromFile(policyPath, {
        roles,
        allAliases: Array.from(registry.keys()),
      }).allowedAliases;
    }

    // Resolve alias
    let alias = nameOrAlias;
    let db = registry.get(alias);
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
          error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' (mysql\npg\nmssql\noracle\nsqlite) or use alias. Candidates: ${hint}`,
        });
      }
      [alias] = matches[0];
      db = registry.get(alias)!;
    }

    // Enforce RBAC
    if (!allowedAliases.includes(alias)) {
      return res.status(403).json({ error: `Forbidden: alias '${alias}' is not allowed for this user/session.` });
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

// ---------- MCP per-session transport ----------
app.post("/mcp", async (req, res) => {
  logReq("POST", req);
  const hasSid = !!req.header("mcp-session-id");
  if (!hasSid && isInitializeRequest((req as any).body)) {
    const transport = await createSession(req); // pass req for roles
    return transport.handleRequest(req as any, res as any, (req as any).body);
  }
  if (hasSid) {
    const sid = req.header("mcp-session-id")!;
    const sess = sessions.get(sid);
    if (!sess) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: Invalid or expired mcp-session-id" },
        id: null,
      });
    }
    touch(sid);
    return sess.transport.handleRequest(req as any, res as any, (req as any).body);
  }
  return res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Bad Request: No valid session or initialize request" },
    id: null,
  });
});

app.get("/mcp", (req, res) => {
  logReq("GET", req);
  const r = requireSession(req, res);
  if (!r) return;
  const { sid, s } = r;
  if (!s) return;
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  touch(sid);
  return s.transport.handleRequest(req as any, res as any);
});

app.delete("/mcp", async (req, res) => {
  logReq("DELETE", req);
  const r = requireSession(req, res);
  if (!r) return;
  const { sid, s } = r;
  if (!s) return;
  await s.transport.handleRequest(req as any, res as any);
  sessions.delete(sid);
  console.log(`[MCP] session deleted: ${sid}`);
});

setInterval(() => {
  if (SESSION_TTL_MS <= 0) return;
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.lastSeenAt > SESSION_TTL_MS) {
      sessions.delete(sid);
      console.log(`[MCP] session evicted (idle): ${sid}`);
    }
  }
}, EVICT_EVERY_MS);

// ---------- Boot ----------
(async () => {
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const loaded = await loadDbRegistryFromYaml(cfgPath);
  registry = loaded.registry;
  closeAll = loaded.closeAll;
  meta = loaded.meta;

  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on http://localhost:${PORT}`);
    const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
    const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
    const aliases = Array.from(registry.keys()).sort();
    console.log(`Available DB types: ${types.join(", ")}`);
    console.log(`Available DB names: ${names.join(", ")}`);
    console.log(`Available DB aliases: ${aliases.join(", ")}`);
    console.log(`[MCP] Per-session server+transport mode is ACTIVE`);
  });
})();
process.on("SIGINT", async () => { await closeAll?.(); process.exit(0); });
process.on("SIGTERM", async () => { await closeAll?.(); process.exit(0); });

























// import "dotenv/config";
// import express from "express";
// import type { Request, Response } from "express";
// import { loadDbRegistryFromYaml } from "../db/registry.js";
// import type { DB } from "../db/provider.js";
// import type { DbAliasMeta } from "../db/registry.js";
// import { mapNamedToDriver } from "../db/paramMap.js";
// import { randomUUID } from "node:crypto";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
// import { registerSqlTools } from "../tools/sql/index.js";
// // NEW: policy API with per-alias tool rules
// import {
//   evaluatePolicyFromFile,
//   evaluateSessionPolicyFromFile,
//   AppliedAliasPolicy,
// } from "../policy/index.js";

// const app = express();
// app.use(express.json());
// const PORT = Number(process.env.PORT ?? 8787);

// // ---------- DB registry state ----------
// type Row = Record<string, any>;
// let registry: Map<string, DB> = new Map();
// let meta: Map<string, DbAliasMeta> = new Map();
// let closeAll: () => Promise<void> = async () => {};

// // ---------- Helper: log ----------
// function logReq(method: string, req: Request) {
//   const sid = req.header?.("mcp-session-id") ?? "(none)";
//   const bodyMethod = (req as any).body?.method ?? "(n/a)";
//   console.log(`[MCP] ${method} sid=${sid} bodyMethod=${bodyMethod}`);
// }

// // ---------- Session with RBAC ----------
// type Session = {
//   server: McpServer;
//   transport: StreamableHTTPServerTransport;
//   createdAt: number;
//   lastSeenAt: number;
//   user: { id?: string; email?: string; roles: string[] };
//   allowedAliases: string[];
//   aliasPolicies?: Record<string, AppliedAliasPolicy>;
// };

// const sessions = new Map<string, Session>();
// const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 30 * 60 * 1000);
// const EVICT_EVERY_MS = 60 * 1000;

// // DEV helper to read roles from request header X-Role
// function rolesFromReq(req: Request): string[] {
//   const raw = req.header("x-role") ?? "";
//   const roles = raw.split(",").map(s => s.trim()).filter(Boolean);
//   return roles.length ? roles : ["librarian"]; // default for dev
// }
// function userFromReq(req: Request) {
//   return {
//     id: req.header("x-user-id") ?? undefined,
//     email: req.header("x-user-email") ?? undefined,
//     roles: rolesFromReq(req),
//   };
// }

// function requireSession(req: Request, res: Response): { sid: string; s?: Session } | null {
//   const sid = req.header("mcp-session-id") ?? "";
//   if (!sid) {
//     res.status(400).send("Invalid or missing mcp-session-id");
//     return null;
//   }
//   return { sid, s: sessions.get(sid) };
// }

// function touch(sid: string) {
//   const s = sessions.get(sid);
//   if (s) s.lastSeenAt = Date.now();
// }

// // Create a session restricted to allowed aliases & tools
// async function createSession(req: Request): Promise<StreamableHTTPServerTransport> {
//   const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });

//   const user = userFromReq(req);
//   const allAliases = Array.from(registry.keys());
//   const policyPath = process.env.POLICY_FILE ?? "./policies.yaml";
//   const { allowedAliases, perAlias } = evaluateSessionPolicyFromFile(policyPath, {
//     roles: user.roles,
//     allAliases,
//   });

//   // Register only allowed aliases (and only allowed tools per alias)
//   for (const alias of allowedAliases) {
//     const db = registry.get(alias)!;
//     registerSqlTools(server, {
//       db,
//       auditPath: process.env.SQL_AUDIT_LOG,
//       ns: alias,
//       meta,
//       registry,
//       policy: perAlias[alias],            // per-alias tool rules
//       userContext: {                      // self-service params available to tool
//         user_id: user.id,
//         user_email: user.email,
//       },
//     });
//   }

//   const transport = new StreamableHTTPServerTransport({
//     sessionIdGenerator: () => randomUUID(),
//     onsessioninitialized: (sid: string) => {
//       sessions.set(sid, {
//         server,
//         transport,
//         createdAt: Date.now(),
//         lastSeenAt: Date.now(),
//         user,
//         allowedAliases,
//         aliasPolicies: perAlias,
//       });
//       console.log(
//         `[MCP] session initialized: ${sid}, roles=${user.roles.join("|")}, aliases=${allowedAliases.join("|")}`
//       );
//     },
//   });

//   await server.connect(transport);
//   return transport;
// }

// // ---------- tiny helpers for REST query policy ----------
// function detectBaseTable(sql: string): string | null {
//   const m = sql.replace(/\s+/g, " ").match(/\bfrom\s+([A-Za-z0-9_."`]+)\b/i);
//   return m?.[1] ?? null;
// }
// function addWhere(sql: string, filter: string): string {
//   const idxOrder = sql.search(/\border\s+by\b/i);
//   const idxLimit = sql.search(/\blimit\b/i);
//   const idxOffset = sql.search(/\boffset\b/i);
//   const idxFetch = sql.search(/\bfetch\b/i);
//   const cut = [idxOrder, idxLimit, idxOffset, idxFetch].filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? sql.length;
//   const head = sql.slice(0, cut);
//   const tail = sql.slice(cut);
//   if (/\bwhere\b/i.test(head)) return head + " AND (" + filter + ") " + tail;
//   return head + " WHERE " + filter + " " + tail;
// }

// // ---------- REST endpoints ----------
// app.get("/health", (_req, res) => res.status(200).send("ok"));
// app.get("/dbs", (_req, res) => {
//   const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
//   res.json(names);
// });
// app.get("/dbs/types", (_req, res) => {
//   const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//   res.json(types);
// });
// app.get("/dbs/aliases", (_req, res) => {
//   res.json(Array.from(registry.keys()).sort());
// });
// app.get("/dbs/list-by-type", (_req, res) => {
//   const grouped: Record<string, string[]> = {};
//   for (const info of meta.values()) (grouped[info.dialect] ??= []).push(info.databaseName);
//   for (const t of Object.keys(grouped)) grouped[t] = Array.from(new Set(grouped[t])).sort((a,b)=>a.localeCompare(b));
//   res.json(grouped);
// });

// app.post("/sql/query", async (req, res) => {
//   try {
//     const { db: nameOrAlias, type, sql, params = {}, readOnly = true, rowLimit = 1000 } = req.body ?? {};

//     if (typeof nameOrAlias !== "string" || !nameOrAlias.trim())
//       return res.status(400).json({ error: "Body 'db' is required (alias or database name)." });
//     if (typeof sql !== "string" || !sql.trim())
//       return res.status(400).json({ error: "Body 'sql' is required." });

//     // Determine allowed aliases for this request
//     let allowedAliases: string[] = Array.from(registry.keys()); // default (dev)
//     let aliasPolicies: Record<string, AppliedAliasPolicy> | undefined;
//     const sid = req.header("mcp-session-id");
//     if (sid && sessions.has(sid)) {
//       const sess = sessions.get(sid)!;
//       allowedAliases = sess.allowedAliases;
//       aliasPolicies = sess.aliasPolicies;
//     } else if ((process.env.DEV_ALLOW_HEADER_ROLE ?? "1") === "1") {
//       const roles = rolesFromReq(req);
//       const policyPath = process.env.POLICY_FILE ?? "./policies.yaml";
//       const evald = evaluateSessionPolicyFromFile(policyPath, {
//         roles,
//         allAliases: Array.from(registry.keys()),
//       });
//       allowedAliases = evald.allowedAliases;
//       aliasPolicies = evald.perAlias;
//     }

//     // Resolve alias
//     let alias = nameOrAlias;
//     let db = registry.get(alias);
//     if (!db) {
//       const dialect = typeof type === "string" && type ? String(type).trim() : undefined;
//       const matches = Array.from(meta.entries())
//         .filter(([_, m]) => m.databaseName === nameOrAlias && (!dialect || m.dialect === dialect));
//       if (matches.length === 0)
//         return res.status(404).json({ error: `Unknown db alias or database name: '${nameOrAlias}'${dialect ? ` (type=${dialect})` : ""}` });
//       if (matches.length > 1) {
//         const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//         return res.status(400).json({ error: `Ambiguous database name '${nameOrAlias}'. Provide 'type' or use alias. Candidates: ${hint}` });
//       }
//       [alias] = matches[0];
//       db = registry.get(alias)!;
//     }

//     // Enforce alias RBAC
//     if (!allowedAliases.includes(alias)) {
//       return res.status(403).json({ error: `Forbidden: alias '${alias}' is not allowed for this user/session.` });
//     }

//     // Tool-level policy for this alias
//     const aliasPolicy = aliasPolicies?.[alias];
//     if (aliasPolicy && !aliasPolicy.tools.query) {
//       return res.status(403).json({ error: `Forbidden: 'sql.query' not allowed on alias '${alias}'.` });
//     }

//     const effectiveReadOnly = aliasPolicy?.readOnly ?? readOnly;
//     if (effectiveReadOnly && !/^\s*select\b/i.test(sql)) {
//       return res.status(400).json({ error: "readOnly mode: only SELECT is allowed." });
//     }

//     // Table allowlist + row filters (self-service)
//     let effectiveSql = sql;
//     let effectiveParams: Record<string, any> = { ...(params || {}) };
//     if (aliasPolicy?.tableAllow?.length || aliasPolicy?.rowFilters) {
//       const base = detectBaseTable(sql);
//       if (base) {
//         const bare = base.replace(/^[`"'[]?|[`"'\]]?$/g, "").split(".").pop()!.toLowerCase();
//         if (aliasPolicy?.tableAllow?.length) {
//           const ok = aliasPolicy.tableAllow.map(t => t.toLowerCase()).includes(bare);
//           if (!ok) return res.status(403).json({ error: `Forbidden: table '${bare}' not allowed on alias '${alias}'.` });
//         }
//         const rowFilter = aliasPolicy?.rowFilters?.[bare];
//         if (rowFilter) {
//           effectiveSql = addWhere(effectiveSql, rowFilter);
//           const sess = sid ? sessions.get(sid) : undefined;
//           effectiveParams = {
//             ...effectiveParams,
//             ...(sess?.user?.email ? { user_email: sess.user.email } : {}),
//             ...(sess?.user?.id ? { user_id: sess.user.id } : {}),
//           };
//         }
//       }
//     }

//     const { text, params: mapped } = mapNamedToDriver(effectiveSql, effectiveParams, db.dialect);
//     const t0 = Date.now();
//     const { rows, rowCount } = await db.query<Row>(text, mapped);
//     const ms = Date.now() - t0;
//     const limited: Row[] = Array.isArray(rows) ? (rows.length > rowLimit ? rows.slice(0, rowLimit) : rows) : [];
//     res.setHeader("X-DB-Dialect", db.dialect);
//     res.setHeader("X-Row-Count", String(rowCount ?? limited.length ?? 0));
//     res.setHeader("X-Elapsed-ms", String(ms));
//     return res.json(limited);
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });

// // ---------- MCP per-session transport ----------
// app.post("/mcp", async (req, res) => {
//   logReq("POST", req);
//   const hasSid = !!req.header("mcp-session-id");
//   if (!hasSid && isInitializeRequest((req as any).body)) {
//     const transport = await createSession(req);
//     return transport.handleRequest(req as any, res as any, (req as any).body);
//   }
//   if (hasSid) {
//     const sid = req.header("mcp-session-id")!;
//     const sess = sessions.get(sid);
//     if (!sess) {
//       return res.status(400).json({
//         jsonrpc: "2.0",
//         error: { code: -32000, message: "Bad Request: Invalid or expired mcp-session-id" },
//         id: null,
//       });
//     }
//     touch(sid);
//     return sess.transport.handleRequest(req as any, res as any, (req as any).body);
//   }
//   return res.status(400).json({
//     jsonrpc: "2.0",
//     error: { code: -32000, message: "Bad Request: No valid session or initialize request" },
//     id: null,
//   });
// });

// app.get("/mcp", (req, res) => {
//   logReq("GET", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   touch(sid);
//   return s.transport.handleRequest(req as any, res as any);
// });

// app.delete("/mcp", async (req, res) => {
//   logReq("DELETE", req);
//   const r = requireSession(req, res);
//   if (!r) return;
//   const { sid, s } = r;
//   if (!s) return;
//   await s.transport.handleRequest(req as any, res as any);
//   sessions.delete(sid);
//   console.log(`[MCP] session deleted: ${sid}`);
// });

// setInterval(() => {
//   if (SESSION_TTL_MS <= 0) return;
//   const now = Date.now();
//   for (const [sid, s] of sessions) {
//     if (now - s.lastSeenAt > SESSION_TTL_MS) {
//       sessions.delete(sid);
//       console.log(`[MCP] session evicted (idle): ${sid}`);
//     }
//   }
// }, EVICT_EVERY_MS);

// // ---------- Boot ----------
// (async () => {
//   const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
//   const loaded = await loadDbRegistryFromYaml(cfgPath);
//   registry = loaded.registry;
//   closeAll = loaded.closeAll;
//   meta = loaded.meta;

//   app.listen(PORT, () => {
//     console.log(`HTTP bridge listening on http://localhost:${PORT}`);
//     const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//     const names = Array.from(new Set(Array.from(meta.values()).map(m => m.databaseName))).sort();
//     const aliases = Array.from(registry.keys()).sort();
//     console.log(`Available DB types: ${types.join(", ")}`);
//     console.log(`Available DB names: ${names.join(", ")}`);
//     console.log(`Available DB aliases: ${aliases.join(", ")}`);
//     console.log(`[MCP] Per-session server+transport mode is ACTIVE`);
//   });
// })();
// process.on("SIGINT", async () => { await closeAll?.(); process.exit(0); });
// process.on("SIGTERM", async () => { await closeAll?.(); process.exit(0); });

