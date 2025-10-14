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

// ——— DB registry state ———
type Row = Record<string, any>;
let registry: Map<string, DB> = new Map();
let meta: Map<string, DbAliasMeta> = new Map();
let closeAll: () => Promise<void> = async () => {};

// ——— Helper: log ———
function logReq(method: string, req: Request) {
  const sid = req.header?.("mcp-session-id") ?? "(none)";
  const bodyMethod = (req as any).body?.method ?? "(n/a)";
  console.log(`[MCP] ${method} sid=${sid} bodyMethod=${bodyMethod}`);
}

// ——— Session with RBAC ———
type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
  user: { id?: string; roles: string[] };
  allowedAliases: string[];
};
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 30 * 60 * 1000);
const EVICT_EVERY_MS = 60 * 1000;

function rolesFromReq(req: Request): string[] {
  const raw = req.header("x-role") ?? "";
  const roles = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return roles.length ? roles : ["admin"];
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

  // Per-alias tool + data policy
  const policies = evaluateToolsPolicyFromFile(policyPath, { roles, aliases: allowedAliases });

  // Discovery tools: admin-only when X-Role is present; open when no role header
  const hasRoleHeader = !!req.header("x-role");
  const isAdmin = roles.includes("admin");
  // const discoveryVisible = hasRoleHeader ? isAdmin : true;
  
  // Always expose discovery tools; their results are already filtered to the session’s allowed aliases.
  const discoveryVisible = true; 

  // User identity (for :user_id in rowFilters)
  const userId = req.header("x-user-id") ?? undefined;

  // Register aliases with the policy and user context
  for (const alias of allowedAliases) {
    const db = registry.get(alias)!;
    const p = policies[alias]; // may be undefined
    const applyDataPolicy = hasRoleHeader && !isAdmin && !!p;
    registerSqlTools(server, {
      db,
      auditPath: process.env.SQL_AUDIT_LOG,
      ns: alias,
      meta,
      registry,
      tools: p ? p.tools : undefined,
      dataPolicy: applyDataPolicy
        ? { readOnly: p!.readOnly, tableAllow: p!.tableAllow, rowFilters: p!.rowFilters }
        : undefined,
      userContext: applyDataPolicy ? { user_id: userId } : undefined,
      discoveryVisible,
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
      console.log(`[MCP] session initialized: ${sid}, roles=${roles.join(",")}, aliases=${allowedAliases.join("|")}`);
    },
  });

  await server.connect(transport);
  return transport;
}

// ——— REST endpoints ———
app.get("/health", (_req, res) => res.status(200).send("ok"));

app.get("/dbs", (_req, res) => {
  const names = Array.from(
    new Set(Array.from(meta.values()).map((m) => m.databaseName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  res.json(names);
});

app.get("/dbs/types", (_req, res) => {
  const types = Array.from(new Set(Array.from(meta.values()).map((m) => m.dialect))).sort();
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

// ——— MCP per-session transport ———
app.post("/mcp", async (req, res) => {
  logReq("POST", req);
  const hasSid = !!req.header("mcp-session-id");
  if (!hasSid && isInitializeRequest((req as any).body)) {
    const transport = await createSession(req);
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

// ——— Boot ———
(async () => {
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const loaded = await loadDbRegistryFromYaml(cfgPath);
  registry = loaded.registry;
  closeAll = loaded.closeAll;
  meta = loaded.meta;
  app.listen(PORT, () => {
    console.log(`HTTP bridge listening on http://localhost:${PORT}`);
    const types = Array.from(new Set(Array.from(meta.values()).map((m) => m.dialect))).sort();
    const names = Array.from(new Set(Array.from(meta.values()).map((m) => m.databaseName))).sort();
    const aliases = Array.from(registry.keys()).sort();
    console.log(`Available DB types: ${types.join(", ")}`);
    console.log(`Available DB names: ${names.join(", ")}`);
    console.log(`Available DB aliases: ${aliases.join(", ")}`);
    console.log(`[MCP] Per-session server+transport mode is ACTIVE`);
  });
})();
process.on("SIGINT", async () => { await closeAll?.(); process.exit(0); });
process.on("SIGTERM", async () => { await closeAll?.(); process.exit(0); });


