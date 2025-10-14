import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../../db/provider.js";
import type { DbAliasMeta } from "../../db/registry.js";
import { mapNamedToDriver } from "../../db/paramMap.js";
import { sqlGuardrails } from "./templates.js";
import { excludedOracleTables } from "./unwantedOracle.js";

/* ────────────────────────────────────────────────────────────────────────────
   Arg normalization + registration helper (avoid SDK pre-validation)
   ──────────────────────────────────────────────────────────────────────────── */
function normalizeArgsRaw(argsRaw: unknown): any {
  if (typeof argsRaw === "string") {
    try { return JSON.parse(argsRaw); } catch { return {}; }
  }
  return argsRaw && typeof argsRaw === "object" ? argsRaw : {};
}

// Always provide raw Zod shape to SDK, and compile locally for parsing.
function registerToolNoSchema<
  TShape extends z.ZodRawShape | null | undefined
>(
  server: McpServer,
  name: string,
  meta: { title?: string; description?: string },
  shape: TShape,
  handler: (args: any) => Promise<any>
) {
  // Raw shape for SDK (publishes JSON Schema)
  const rawShape: z.ZodRawShape = (shape ?? {}) as z.ZodRawShape;

  // Compiled object for local parsing
  const compiled = z.object(rawShape);

  server.registerTool(
    name,
    {
      title: meta.title,
      description: meta.description,
      // ⬅️ IMPORTANT: pass RAW SHAPE, not a ZodObject
      inputSchema: rawShape,
    },
    async (argsRaw) => {
      const raw = normalizeArgsRaw(argsRaw);
      const parsed = compiled.parse(raw);
      return handler(parsed);
    }
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Per-server state
   ──────────────────────────────────────────────────────────────────────────── */
const serverAliases = new WeakMap<McpServer, Set<string>>();
const discoveryRegistered = new WeakSet<McpServer>();

export function registerSqlTools(
  server: McpServer,
  {
    db,
    auditPath,
    ns,
    meta,
    registry,
    tools,
    dataPolicy,
    userContext,
    discoveryVisible,
  }: {
    db: DB;
    auditPath?: string;
    ns?: string;
    meta: Map<string, DbAliasMeta>;
    registry: Map<string, DB>;
    tools?: { schema?: boolean; peek?: boolean; query?: boolean };
    dataPolicy?: {
      readOnly?: boolean;
      tableAllow?: string[];
      rowFilters?: Record<string, string>;
    };
    userContext?: { user_id?: string };
    discoveryVisible?: boolean;
  }
) {
  const name = (base: string) => (ns ? `${ns}.${base}` : base);

  // Track aliases served in this session
  if (ns) {
    const set = serverAliases.get(server) ?? new Set<string>();
    set.add(ns);
    serverAliases.set(server, set);
  }

  /* ────────────────────────────────────────────────────────────────────────
     Discovery tools (registered once per server)
     ──────────────────────────────────────────────────────────────────────── */
  if (!discoveryRegistered.has(server)) {
    discoveryRegistered.add(server);

    if (discoveryVisible !== false) {
      const metaVisible = (): DbAliasMeta[] => {
        const allowed = serverAliases.get(server) ?? new Set<string>();
        const out: DbAliasMeta[] = [];
        for (const [alias, m] of meta.entries()) if (allowed.has(alias)) out.push({ ...m });
        return out;
      };

      // db.aliases (no args) -> JSON only
      registerToolNoSchema(
        server,
        "db.aliases",
        {
          title: "List database aliases",
          description: "Return the list of available database aliases visible to this session.",
        },
        null,
        async () => {
          const set = serverAliases.get(server) ?? new Set<string>();
          const aliases = Array.from(set).sort();
          // return { content: [{ type: "json", json: aliases }] };
          return { content: [{ type: "text", text: JSON.stringify(aliases) }] };
        }
      );

      // db.types (no args) -> JSON only
      registerToolNoSchema(
        server,
        "db.types",
        {
          title: "List available database (types)",
          description: "List available database dialects (types) visible in this session.",
        },
        null,
        async () => {
          const visible = metaVisible();
          const types = Array.from(new Set(visible.map((m) => m.dialect))).sort();
          // return { content: [{ type: "json", json: types }] };
          return { content: [{ type: "text", text: JSON.stringify(types) }] };
        }
      );

      // db.names (no args) -> JSON only
      registerToolNoSchema(
        server,
        "db.names",
        {
          title: "List database names",
          description: "List database names (not aliases) visible in this session (unique, sorted).",
        },
        null,
        async () => {
          const visible = metaVisible();
          const names = Array.from(
            new Set(visible.map((m) => m.databaseName).filter(Boolean))
          ).sort((a, b) => a.localeCompare(b));
          return { content: [{ type: "text", text: JSON.stringify(names) }] };
          // return { content: [{ type: "json", json: names }] };
        }
      );

      // db.listByType (args) -> JSON only
      const LIST_BY_TYPE = {
        type: z.string().min(1).describe("Dialect: mysql\npg\nmssql\noracle\nsqlite"),
        unique: z.boolean().optional().default(true),
        includeAliases: z.boolean().optional().default(false),
      } satisfies z.ZodRawShape;

      registerToolNoSchema(
        server,
        "db.listByType",
        {
          title: "List databases by type",
          description:
            "List database names for a given dialect. unique=true returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
        },
        LIST_BY_TYPE,
        async ({ type, unique, includeAliases }) => {
          const dialect = String(type ?? "").trim();
          if (!dialect) {
            const err = { error: "Missing required 'type'." };
            return { isError: true, content: [{ type: "json", json: err }] };
          }
          const allowed = serverAliases.get(server) ?? new Set<string>();
          const visible = [...meta.entries()]
            .filter(([alias]) => allowed.has(alias))
            .map(([, m]) => m)
            .filter((m) => m.dialect === dialect);

          if (unique) {
            const names = Array.from(
              new Set(visible.map((i) => i.databaseName).filter(Boolean))
            ).sort((a, b) => a.localeCompare(b));
            return { content: [{ type: "json", json: names }] };
          }
          const rows = visible
            .map((i) => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
            .sort(
              (a: any, b: any) =>
                String(a.name).localeCompare(String(b.name)) +
                (a.alias !== undefined && b.alias !== undefined
                  ? String(a.alias).localeCompare(String(b.alias))
                  : 0)
            );
          return { content: [{ type: "json", json: rows }] };
        }
      );
    }
  }

  async function audit(line: string) {
    if (!auditPath) return;
    const fs = await import("node:fs/promises");
    await fs.appendFile(auditPath, line + "\n", "utf8");
  }

  /* ────────────────────────────────────────────────────────────────────────
     Namespaced SQL tools
     ──────────────────────────────────────────────────────────────────────── */

  // sql.schema (no args) -> Markdown only
  if (tools?.schema !== false) {
    registerToolNoSchema(
      server,
      name("sql.schema"),
      {
        title: "Describe schema",
        description:
          "Return a compact Markdown outline of tables and columns for the chosen database.",
      },
      null,
      async () => {
        const md = await describeSchema(db);
        return { content: [{ type: "text", text: md }] };
      }
    );
  }

  // sql.peek (args) -> single-type output
  if (tools?.peek !== false) {
    const PEEK_SHAPE = {
      maxRowsPerTable: z.number().int().min(1).max(10000).optional().default(50),
      as: z.enum(["markdown", "json"]).optional().default("markdown"),
    } satisfies z.ZodRawShape;

    registerToolNoSchema(
      server,
      name("sql.peek"),
      {
        title: "Peek into database content",
        description: [
          "Return up to N rows from each base table in the chosen database.",
          "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
        ].join("\n"),
      },
      PEEK_SHAPE,
      async ({ maxRowsPerTable, as }) => {
        const tables = await listTables(db);
        const safeTables = Array.from(
          new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0))
        );
        if (!safeTables.length) {
          return as === "json"
            ? { content: [{ type: "json", json: [] }] }
            : { content: [{ type: "text", text: "_(no tables)_" }] };
        }
        const dump = await dumpTables(db, safeTables, maxRowsPerTable!);
        if (as === "json") {
          return { content: [{ type: "json", json: dump }] };
        }
        const md = dump
          .map(({ table, rows }) => `## ${table}\n\n${toMarkdown(rows)}`)
          .join("\n\n");
        return { content: [{ type: "text", text: md }] };
      }
    );
  }

  // sql.query (args) -> single-type output
  if (tools?.query !== false) {
    const QUERY_SHAPE = {
      sql: z.string(),
      params: z.record(z.any()).optional().default({}),
      readOnly: z.boolean().optional().default(true),
      rowLimit: z.number().int().min(1).max(10000).optional().default(1000),
      as: z.enum(["json", "markdown"]).optional().default("json"),
    } satisfies z.ZodRawShape;

    registerToolNoSchema(
      server,
      name("sql.query"),
      {
        title: "Execute SQL",
        description: ["Execute a parameterized SQL query against the chosen database.", "", "**Usage Tips:**", sqlGuardrails()].join("\n"),
      },
      QUERY_SHAPE,
      async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }) => {
        // 1) readOnly (policy overrides user input)
        const effectiveReadOnly = dataPolicy?.readOnly ?? readOnly;
        if (effectiveReadOnly && !/^\s*select\b/i.test(sql)) {
          throw new Error("readOnly mode: only SELECT is allowed.");
        }

        // NEW: Only block when a non-empty user_id is explicitly provided and differs
        const userIdArgPresent =
          params != null &&
          Object.prototype.hasOwnProperty.call(params, "user_id") &&
          params.user_id != null &&
          String(params.user_id).trim() !== "";

        if (dataPolicy?.rowFilters && userIdArgPresent) {
          const arg = String(params.user_id).trim();
          const sessionUid = String(userContext?.user_id ?? "").trim();
          if (arg !== sessionUid) {
            throw new Error("I'm sorry, you don't have permission to access this data.");
          }
        }

        // 2) table allowlist + 3) row filters
        let effectiveSql = sql;
        let effectiveParams: Record<string, any> = { ...(params ?? {}) };

        if ((dataPolicy?.tableAllow?.length || dataPolicy?.rowFilters)) {
          const base = detectBaseTable(sql);
          if (base) {
            // const bare = base.replace(/^["'`\[\]]?/g, "").split(".").pop()!.toLowerCase();
            
            const lastPart = base.split(".").pop()!;
            const bare = lastPart.replace(/^[\[\]"'`]+|[\[\]"'`]+$/g, "").toLowerCase();

            // table allowlist
            if (dataPolicy?.tableAllow?.length) {
              const ok = dataPolicy.tableAllow.map((t) => t.toLowerCase()).includes(bare);
              // if (!ok) throw new Error(`Forbidden: table '${bare}' not allowed for this role.`);
              if (!ok) throw new Error("I'm sorry, you don't have permission to access this table.");
            }

            // row filters
            const filter = dataPolicy?.rowFilters?.[bare];
            if (filter) {
              if (/:user_id\b/.test(filter) && !userContext?.user_id) {
                throw new Error("Missing user identity (user_id) for row-level policy.");
              }
              effectiveSql = addWhere(effectiveSql, filter);
              if (userContext?.user_id !== undefined) {
                effectiveParams = { ...effectiveParams, user_id: userContext.user_id };
              }
            }
          }
        }

        // 4) execute
        const { text, params: mapped } = mapNamedToDriver(effectiveSql, effectiveParams, db.dialect);
        const t0 = Date.now();
        const { rows, rowCount } = await db.query(text, mapped);
        const ms = Date.now() - t0;
        const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;

        await audit(`[${new Date().toISOString()}] ${db.dialect} rows=${rowCount ?? limited?.length ?? 0} ms=${ms} sql=${effectiveSql}`);

        if (as === "markdown") {
          return { content: [{ type: "text", text: toMarkdown(limited) }] };
        }
        return { content: [{ type: "json", json: limited }] };
      }
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Helper functions (unchanged except markdown table layout + :user_id fix)
   ──────────────────────────────────────────────────────────────────────────── */
function toMarkdown(rows: any[]) {
  if (!rows?.length) return "_(no rows)_";
  const headers = Object.keys(rows[0]);
  const top = `${headers.join(" | ")}\n`;
  const sep = `${headers.map(() => "---").join(" | ")}\n`;
  const body = rows.map((r) => `${headers.map((h) => fmt(r[h])).join(" | ")}`).join("\n");
  return [top, sep, body].join("");
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "```json\n" + JSON.stringify(v) + "\n```";
  return String(v);
}

function quoteIdent(dialect: DB["dialect"], ident: string) {
  switch (dialect) {
    case "pg":
    case "oracle":
    case "sqlite": {
      const safe = ident.replace(/"/g, '""'); return `"${safe}"`;
    }
    case "mysql": {
      const safe = ident.replace(/`/g, "``"); return `\`${safe}\``;
    }
    case "mssql": {
      const safe = ident.replace(/]/g, "]]"); return `[${safe}]`;
    }
  }
}

function quoteMaybeQualified(dialect: DB["dialect"], ident: string) {
  if (ident.includes(".")) {
    const [schema, name] = ident.split(".");
    return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name)}`;
  }
  return quoteIdent(dialect, ident);
}

async function listTables(dbX: DB): Promise<string[]> {
  switch (dbX.dialect) {
    case "pg": {
      const sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`;
      const { rows } = await dbX.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "mysql": {
      const sql = `
        SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`;
      const { rows } = await dbX.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "mssql": {
      const sql = `
        SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME`;
      const { rows } = await dbX.query<{ table_schema: string; table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "oracle": {
      const quoted = excludedOracleTables.map((name) => `'${name.toUpperCase()}'`).join(", ");
      const sql = `
        SELECT table_name AS "table_name"
        FROM user_tables
        WHERE temporary = 'N'
          AND table_name NOT LIKE 'ROLLING$%'
          AND table_name NOT LIKE 'SCHEDULER_%'
          ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
          AND table_name NOT IN (SELECT object_name FROM user_recyclebin)
        ORDER BY table_name`;
      const { rows } = await dbX.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "sqlite": {
      const sql = `
        SELECT name AS table_name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`;
      const { rows } = await dbX.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
  }
}

async function dumpTables(dbX: DB, tables: string[], maxRows: number) {
  const result: { table: string; rows: any[] }[] = [];
  for (const t of tables) {
    const qTable = quoteMaybeQualified(dbX.dialect, t);
    let sql: string; let params: any;
    switch (dbX.dialect) {
      case "pg": { sql = `SELECT * FROM ${qTable} LIMIT $1`; params = [maxRows]; break; }
      case "mysql":
      case "sqlite": { sql = `SELECT * FROM ${qTable} LIMIT ?`; params = [maxRows]; break; }
      case "mssql": { sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`; params = []; break; }
      case "oracle": { sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`; params = { n: maxRows }; break; }
    }
    const { rows } = await dbX.query<any>(sql, params);
    result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
  }
  return result;
}

async function describeViaQuery<T extends Record<string, any>>(
  dbX: DB,
  sql: string,
  tableKey: string,
  columnKey: string,
  typeKey: string
): Promise<string> {
  const { rows } = await dbX.query<T>(sql, []);
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const t = (r as any)[tableKey];
    const c = (r as any)[columnKey];
    const d = (r as any)[typeKey];
    if (!t || !c) continue;
    const list = m.get(t) ?? [];
    list.push(`${c} ${d ?? ""}`.trim());
    m.set(t, list);
  }
  return (
    [...m.entries()]
      .map(([t, cols]) => `### ${t}\n- ${cols.join("\n- ")}`)
      .join("\n\n") || "_(no tables)_"
  );
}

async function describeSchema(dbX: DB) {
  const tables = await listTables(dbX);
  const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
  if (!safeTables.length) return "_(no tables)_";
  switch (dbX.dialect) {
    case "pg": {
      const inList = safeTables.map((t) => `'${t}'`).join(", ");
      const sql = `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN (${inList})
        ORDER BY table_name, ordinal_position`;
      return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
    }
    case "mysql": {
      const inList = safeTables.map((t) => `'${t}'`).join(", ");
      const sql = `
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
        ORDER BY TABLE_NAME, ORDINAL_POSITION`;
      return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
    }
    case "mssql": {
      const q = safeTables.map((t) => {
        if (t.includes(".")) {
          const [schema, name] = t.split(".");
          return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
        }
        return { schema: null as string | null, name: t.replace(/'/g, "''") };
      });
      const hasSchema = q.some((x) => !!x.schema);
      let sql: string;
      if (hasSchema) {
        const orConds = q
          .map((x) =>
            x.schema
              ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
              : `(TABLE_NAME = '${x.name}')`
          )
          .join(" OR ");
        sql = `
          SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE ${orConds}
          ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
      } else {
        const inList = q.map((x) => `'${x.name}'`).join(", ");
        sql = `
          SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME IN (${inList})
          ORDER BY TABLE_NAME, ORDINAL_POSITION`;
      }
      return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
    }
    case "oracle": {
      const inList = safeTables.map((t) => `'${t.toUpperCase()}'`).join(", ");
      const sql = `
        SELECT
          table_name AS "table_name",
          column_name AS "column_name",
          CASE
            WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR','NCHAR') AND data_length IS NOT NULL
              THEN data_type || '(' || data_length || ')'
            WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL
              THEN data_type || '(' || data_precision || NVL2(data_scale, ',' || data_scale, '') || ')'
            ELSE data_type
          END AS "data_type"
        FROM user_tab_columns
        WHERE UPPER(table_name) IN (${inList})
        ORDER BY table_name, column_id`;
      return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
    }
    case "sqlite": {
      const parts: string[] = [];
      for (const t of safeTables) {
        const pragma = `PRAGMA table_info(${quoteIdent(dbX.dialect, t)});`;
        const { rows } = await dbX.query<{ name: string; type: string }>(pragma, []);
        if (!rows?.length) continue;
        const body = rows.map((r) => `- ${r.name} \`${r.type}\``).join("\n");
        parts.push(`## ${t}\n\n${body}`);
      }
      return parts.join("\n\n") || "_(no tables)_";
    }
  }
}

function detectBaseTable(sql: string): string | null {
  const m = sql.replace(/\s+/g, " ").match(/\bfrom\s+([A-Za-z0-9_."`\[\]]+)/i);
  return m?.[1] ?? null;
}

function addWhere(sql: string, filter: string): string {
  const idxOrder = sql.search(/\border\s+by\b/i);
  const idxLimit = sql.search(/\blimit\b/i);
  const idxOffset = sql.search(/\boffset\b/i);
  const idxFetch = sql.search(/\bfetch\b/i);
  const cut = [idxOrder, idxLimit, idxOffset, idxFetch].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? sql.length;
  const head = sql.slice(0, cut);
  const tail = sql.slice(cut);
  if (/\bwhere\b/i.test(head)) return head + " AND (" + filter + ") " + tail;
  return head + " WHERE " + filter + " " + tail;
}
