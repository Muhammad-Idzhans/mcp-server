import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";

import { loadDbRegistryFromYaml } from "../db/registry.js";
import { mapNamedToDriver } from "../db/paramMap.js";
import type { DB } from "../db/provider.js";

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
let registry: Map<string, DB>;
let closeAll: () => Promise<void>;

// health
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// list DB aliases
app.get("/dbs", (_req: Request, res: Response) => {
  const aliases = Array.from(registry?.keys?.() ?? []);
  res.json(aliases);
});

// POST /sql/query
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

// MCP server + tools
const mcpServer = new McpServer({ name: "mcp-sql", version: "0.2.0" });


// Initial Block of Code
// ----------------------------------------------------------------------------------------------------------------------------------------
// let transport: StreamableHTTPServerTransport | null = null;
// let sessionId: string | null = null;

// // MCP endpoint (Streamable HTTP)
// app.post("/mcp", async (req: Request, res: Response) => {
//   try {
//     if (!transport) {
//       // First request must be "initialize" with no session header yet
//       if (!isInitializeRequest(req.body)) {
//         return res.status(400).json({
//           error: "First request must be 'initialize' (no mcp-session-id yet)."
//         });
//       }

//       transport = new StreamableHTTPServerTransport({
//         enableDnsRebindingProtection: true,              // good for prod
//         sessionIdGenerator: () => {
//           sessionId = randomUUID();
//           return sessionId!;
//         },
//         // NOTE: lowercase header is fine; headers are case-insensitive
//         onsessioninitialized: (sid: string) => {
//           sessionId = sid;
//           // Send both casings to be maximally compatible with different clients
//           res.setHeader("Mcp-Session-Id", sid);
//           res.setHeader("mcp-session-id", sid);
//         },
//       });

//       await mcpServer.connect(transport);
//     } 
//     // else {
//     //   const sidHeader = req.header("mcp-session-id");
//     //   if (!sidHeader || sidHeader !== sessionId) {
//     //     return res.status(404).json({ error: "Unknown or missing mcp-session-id" });
//     //   }
//     // }

//     // IMPORTANT: pass the parsed body so transport doesn't re-read the stream
//     await transport.handleRequest(req, res, req.body);
//   } catch (err: any) {
//     // Reset stale MCP state so next attempt can re-initialize cleanly
//     transport = null;
//     sessionId = null;

//     console.error("[mcp-http] /mcp error:", err);
//     res.status(500).json({ error: String(err?.message ?? err) });
//   }
// });


// Updated Block of Code
// ----------------------------------------------------------------------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------------------------------------------------------------------

(async () => {
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const loaded = await loadDbRegistryFromYaml(cfgPath);
  registry = loaded.registry;
  closeAll = loaded.closeAll;

  for (const [alias, db] of registry.entries()) {
    registerSqlTools(mcpServer, {
      db,
      auditPath: process.env.SQL_AUDIT_LOG,
      ns: alias,
    });
  }

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
