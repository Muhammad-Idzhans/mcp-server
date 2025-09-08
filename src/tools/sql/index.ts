// src/tools/sql/index.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../../db/provider.js";
import { mapNamedToDriver } from "../../db/paramMap.js";
import { sqlGuardrails } from "./templates.js"; // fixed: template.js (singular)
import { excludedOracleTables } from "./unwantedOracle.js";

export function registerSqlTools(
  server: McpServer,
  { db, auditPath, ns }: { db: DB; auditPath?: string; ns?: string }
) {
  const name = (base: string) => (ns ? `${ns}.${base}` : base);

  async function audit(line: string) {
    if (!auditPath) return;
    const fs = await import("node:fs/promises");
    await fs.appendFile(auditPath, line + "\n", "utf8");
  }

  // ----------------------- sql.peek -----------------------
  server.registerTool(
    name("sql.peek"),
    {
      title: "Peek into database content",
      description: [
        "Return up to N rows from each base table in the active database.",
        "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
      ].join("\n"),
      inputSchema: {
        maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
        as: z.enum(["markdown", "json"]).default("markdown"),
      },
    },
    async ({ maxRowsPerTable, as }) => {
      const tables = await listTables(db);
      const safeTables = Array.from(
        new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0))
      );

      if (!safeTables.length) {
        if (as === "json") {
          return { content: [{ type: "text", text: "[]" }] };
        }
        return { content: [{ type: "text", text: "_(no tables)_" }] };
      }

      const dump = await dumpTables(db, safeTables, maxRowsPerTable);
      if (as === "json") {
        return { content: [{ type: "text", text: JSON.stringify(dump, null, 2) }] };
      }

      const md = dump
        .map(({ table, rows }) => `## ${table}\n\n${toMarkdown(rows)}`)
        .join("\n\n");

      return { content: [{ type: "text", text: md }] };
    }
  );

  // ----------------------- sql.schema -----------------------
  server.registerTool(
    name("sql.schema"),
    {
      title: "Describe schema",
      description: "Return a compact Markdown outline of tables and columns.",
      inputSchema: {},
    },
    async () => {
      const md = await describeSchema(db);
      return { content: [{ type: "text", text: md }] };
    }
  );

  // ----------------------- sql.query -----------------------
  server.registerTool(
    name("sql.query"),
    {
      title: "Execute SQL",
      description: [
        "Execute a parameterized SQL query against the active database.",
        "",
        "**Usage Tips:**",
        sqlGuardrails(),
      ].join("\n"),
      inputSchema: {
        sql: z.string(),
        params: z.record(z.any()).optional().default({}),
        readOnly: z.boolean().default(true),
        rowLimit: z.number().int().min(1).max(10000).default(1000),
        as: z.enum(["json", "markdown"]).default("json"),
      },
    },
    async ({ sql, params, readOnly, rowLimit, as }) => {
      if (readOnly && !/^\s*select\b/i.test(sql)) {
        throw new Error("readOnly mode: only SELECT is allowed.");
      }
      const { text, params: mapped } = mapNamedToDriver(sql, params ?? {}, db.dialect);
      const t0 = Date.now();
      const { rows, rowCount } = await db.query(text, mapped);
      const ms = Date.now() - t0;

      await audit(
        `[${new Date().toISOString()}] ${db.dialect} rows=${rowCount} ms=${ms} sql=${sql}`
      );

      const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;

      if (as === "markdown") {
        return { content: [{ type: "text", text: toMarkdown(limited) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
    }
  );
}

/* ------------------------- helpers ------------------------- */
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
      const safe = ident.replace(/"/g, '""');
      return `"${safe}"`;
    }
    case "mysql": {
      const safe = ident.replace(/`/g, "``");
      return `\`${safe}\``;
    }
    case "mssql": {
      const safe = ident.replace(/]/g, "]]");
      return `[${safe}]`;
    }
  }
}

/** Discover base table names (no views), dialect-aware */
async function listTables(db: DB): Promise<string[]> {
  switch (db.dialect) {
    case "pg": {
      const sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`;
      const { rows } = await db.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "mysql": {
      const sql = `
        SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`;
      const { rows } = await db.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "mssql": {
      const sql = `
        SELECT TABLE_NAME AS table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`;
      const { rows } = await db.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "oracle": {
      // Prefer USER_TABLES (base tables only) instead of USER_TAB_COLUMNS (tables + views + clusters).
      // Keep your explicit excludes; also hide any recycled/dropped objects.
      const quoted = excludedOracleTables.map((name) => `'${name.toUpperCase()}'`).join(", ");

      const sql = `
        SELECT table_name AS "table_name"
        FROM user_tables
        WHERE temporary = 'N'                       -- exclude temporary tables
          AND table_name NOT LIKE 'ROLLING$%'       -- your existing patterns
          AND table_name NOT LIKE 'SCHEDULER_%'
          ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
          AND table_name NOT IN (
            SELECT object_name FROM user_recyclebin -- avoid BIN$... names
          )
        ORDER BY table_name`;

      const { rows } = await db.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
    case "sqlite": {
      const sql = `
        SELECT name AS table_name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`;
      const { rows } = await db.query<{ table_name: string }>(sql, []);
      return rows.map((r) => r.table_name);
    }
  }
}

/** Fetch up to N rows from each table using dialect-correct limiting */
async function dumpTables(db: DB, tables: string[], maxRows: number) {
  const result: { table: string; rows: any[] }[] = [];
  for (const t of tables) {
    const qTable = quoteIdent(db.dialect, t);
    let sql: string;
    switch (db.dialect) {
      case "pg":
      case "mysql":
      case "sqlite":
        sql = `SELECT * FROM ${qTable} LIMIT :n`; // LIMIT dialects
        break;
      case "mssql":
        sql = `SELECT TOP (:n) * FROM ${qTable}`; // TOP for SQL Server (parameterized)
        break;
      case "oracle":
        sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`; // ROWNUM for Oracle
        break;
    }
    const { text, params } = mapNamedToDriver(sql, { n: maxRows }, db.dialect);
    const { rows } = await db.query<any>(text, params);
    result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
  }
  return result;
}

/** Compact schema outline — FILTERED by listTables() so it matches sql.peek */
async function describeSchema(db: DB) {
  const tables = await listTables(db);
  const safeTables = Array.from(
    new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0))
  );
  if (!safeTables.length) return "_(no tables)_";

  switch (db.dialect) {
    case "pg": {
      const inList = safeTables.map((t) => `'${t}'`).join(", ");
      const sql = `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN (${inList})
        ORDER BY table_name, ordinal_position`;
      return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
    }
    case "mysql": {
      const inList = safeTables.map((t) => `'${t}'`).join(", ");
      const sql = `
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
        ORDER BY TABLE_NAME, ORDINAL_POSITION`;
      return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
    }
    case "mssql": {
      const inList = safeTables.map((t) => `'${t}'`).join(", ");
      const sql = `
        SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN (${inList})
        ORDER BY TABLE_NAME, ORDINAL_POSITION`;
      return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
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
              THEN data_type || '(' || data_precision || NVL2(data_scale, ','||data_scale, '') || ')'
            ELSE data_type
          END AS "data_type"
        FROM user_tab_columns
        WHERE UPPER(table_name) IN (${inList})
        ORDER BY table_name, column_id`;
      return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
    }
    case "sqlite": {
      const parts: string[] = [];
      for (const t of safeTables) {
        const pragma = `PRAGMA table_info(${quoteIdent(db.dialect, t)});`;
        const { rows } = await db.query<{ name: string; type: string }>(pragma, []);
        if (!rows?.length) continue;
        const body = rows.map((r) => `- ${r.name} \`${r.type}\``).join("\n");
        parts.push(`## ${t}\n\n${body}`);
      }
      return parts.join("\n\n") || "_(no tables)_";
    }
  }
}

async function describeViaQuery<T extends Record<string, any>>(
  db: DB,
  sql: string,
  tableKey: string,
  columnKey: string,
  typeKey: string
): Promise<string> {
  const { rows } = await db.query<T>(sql, []);
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const t = r[tableKey];
    const c = r[columnKey];
    const d = r[typeKey];
    if (!t || !c) continue;
    const list = m.get(t) ?? [];
    list.push(`${c} ${d ?? ""}`.trim());
    m.set(t, list);
  }
  return [...m.entries()]
    .map(([t, cols]) => `### ${t}\n- ${cols.join("\n- ")}`)
    .join("\n\n") || "_(no tables)_";
}
