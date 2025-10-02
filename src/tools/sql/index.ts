// // src/tools/sql/index.ts
// import { z } from "zod";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import type { DB } from "../../db/provider.js";
// import type { DbAliasMeta } from "../../db/registry.js";
// import { mapNamedToDriver } from "../../db/paramMap.js";
// import { sqlGuardrails } from "./templates.js"; // fixed: template.js (singular)
// import { excludedOracleTables } from "./unwantedOracle.js";

// const __aliases = new Set<string>();
// let __dbListRegistered = false;

// // MCP Server Tools Registration
// export function registerSqlTools(
//   server: McpServer,
//   {
//     db,
//     auditPath,
//     ns,
//     meta,
//     registry
//   }: {
//     db: DB;
//     auditPath?: string;
//     ns?: string
//     meta: Map<string, DbAliasMeta>;
//     registry: Map<string, DB>;
//   }
// ) {
//   const name = (base: string) => (ns ? `${ns}.${base}` : base);

//   // collect the alias for db.list to return later
//   if (ns) __aliases.add(ns);

//   // Add: register the global (non-namespaced) db.list tool once
//   if (!__dbListRegistered) {
//     __dbListRegistered = true;

//     // --------------------- db.aliases ---------------------
//     server.registerTool(
//       "db.aliases",
//       {
//         title: "List databases aliases",
//         description:
//           "Return the list of available database aliases created/available on this server (e.g., mysql, mssql, mssql_2, pg, oracle). " +
//           "Call this first to discover which DBs you can query.",
//         // IMPORTANT: registerTool expects a ZodRawShape (plain object), so use {} not z.object({})
//         inputSchema: {},
//       },
//       async () => {
//         const aliases = Array.from(__aliases).sort();
//         // MCP tools return content blocks; 'text' is the most compatible form
//         return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
//       }
//     );

//     // --------------------- db.types ---------------------
//     server.registerTool(
//       "db.types",
//       {
//         title: "List available database (types)",
//         description: "List available database dialects (types), e.g., MySQL, PostgreSQL, MSSQL, Oracle.",
//         inputSchema: {},
//       },
//       async () => {
//         const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//         return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
//       }
//     )

//     // --------------------- db.names ---------------------
//     server.registerTool(
//       "db.names",
//       {
//         title: "List database names",
//         description: "List database names (not aliases) across all configured databases (unique, sorted).",
//         inputSchema: {},
//       },
//       async () => {
//         const names = Array.from(
//           new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//         ).sort((a, b) => a.localeCompare(b));
//         return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//       }
//     );

//     // --------------------- db.listByType ---------------------
//     server.registerTool(
//       "db.listByType",
//       {
//         title: "List databases by type",
//         description:
//           "List database names for a given dialect (type). unique=true (default) returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
//         inputSchema: {
//           type: z
//             .string()
//             .min(1, "type is required")
//             .describe("Dialect: mysql \n pg \n mssql \n oracle"),
//           unique: z
//             .boolean()
//             .default(true)
//             .describe("If true (default), return unique names only. If false, return rows per alias."),
//           includeAliases: z
//             .boolean()
//             .default(false)
//             .describe("When unique=false, include 'alias' in each row."),
//         },
//       },
//       async ({ type, unique = true, includeAliases = false }) => {
//         const dialect = String(type ?? "").trim();
//         if (!dialect) {
//           return {
//             isError: true,
//             content: [{ type: "text", text: JSON.stringify({ error: "Missing required 'type'." }) }],
//           };
//         }
//         const items = Array.from(meta.values()).filter(m => m.dialect === dialect);
//         if (unique) {
//           const names = Array.from(new Set(items.map(i => i.databaseName).filter(Boolean)))
//             .sort((a, b) => a.localeCompare(b));
//           return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//         }
//         const rows = items
//           .map(i => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
//           .sort(
//             (a: any, b: any) =>
//               String(a.name).localeCompare(String(b.name)) ||
//               (a.alias !== undefined && b.alias !== undefined
//                 ? String(a.alias).localeCompare(String(b.alias))
//                 : 0)
//           );
//         return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
//       }
//     );
//   }

//   function resolveTargetDb(args: any) {
//     // Accept db name in any of these fields
//     const dbNameArg = (args?.db ?? args?.database ?? args?.name)?.toString().trim();
//     const typeArg: string | undefined = args?.type ? String(args.type).trim() : undefined;

//     if (!dbNameArg) {
//       // Fallback: use the alias-bound db (current behavior)
//       return { db, alias: ns ?? "(unnamed)", dialect: db.dialect };
//     }

//     // Find all aliases whose databaseName matches (and type if provided)
//     const matches = Array.from(meta.entries())
//       .filter(([_, m]) => m.databaseName === dbNameArg && (!typeArg || m.dialect === typeArg));

//     if (matches.length === 0) {
//       throw new Error(
//         `No database found with name '${dbNameArg}'${typeArg ? ` and type '${typeArg}'` : ""}.`
//       );
//     }
//     if (matches.length > 1) {
//       const hint = matches.map(([a, m]) => `${a} (${m.dialect})`).join(", ");
//       throw new Error(
//         `Ambiguous database name '${dbNameArg}'. Please specify 'type' (one of mysql\npg\nmssql\noracle\nsqlite) ` +
//         `or use alias directly. Candidates: ${hint}`
//       );
//     }
//     const [alias, m] = matches[0];
//     const selected = registry.get(alias);
//     if (!selected) throw new Error(`Internal: registry missing alias '${alias}'.`);
//     return { db: selected, alias, dialect: m.dialect };
//   }

//   async function audit(line: string) {
//     if (!auditPath) return;
//     const fs = await import("node:fs/promises");
//     await fs.appendFile(auditPath, line + "\n", "utf8");
//   }

//   // --------------------- sql.peek ---------------------
//   server.registerTool(
//     name("sql.peek"),
//     {
//       title: "Peek into database content",
//       description: [
//         "Return up to N rows from each base table in the chosen database.",
//         "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
//         "",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' (mysql\npg\nmssql\noracle\nsqlite) to disambiguate."
//       ].join("\n"),
//       inputSchema: {
//         db: z.string().optional().describe("Database name (not alias), e.g., coffee_database"),
//         type: z.enum(["mysql","pg","mssql","oracle","sqlite"]).optional(),
//         maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
//         as: z.enum(["markdown", "json"]).default("markdown"),
//       },
//     },
//     async ({ db: dbName, type, maxRowsPerTable, as }) => {
//       const { db: targetDb } = resolveTargetDb({ db: dbName, type });
//       const tables = await listTables(targetDb);
//       const safeTables = Array.from(
//         new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0))
//       );
//       if (!safeTables.length) {
//         if (as === "json") {
//           return { content: [{ type: "text", text: "[]" }] };
//         }
//         return { content: [{ type: "text", text: "_(no tables)_" }] };
//       }
//       const dump = await dumpTables(targetDb, safeTables, maxRowsPerTable);
//       if (as === "json") {
//         return { content: [{ type: "text", text: JSON.stringify(dump, null, 2) }] };
//       }
//       const md = dump.map(({ table, rows }) => `## ${table}\n\n${toMarkdown(rows)}`).join("\n\n");
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

//   // --------------------- sql.schema ---------------------
//   server.registerTool(
//     name("sql.schema"),
//     {
//       title: "Describe schema",
//       description: [
//         "Return a compact Markdown outline of tables and columns for the chosen database.",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' to disambiguate."
//       ].join("\n"),
//       inputSchema: {
//         db: z.string().optional().describe("Database name (not alias)"),
//         type: z.enum(["mysql","pg","mssql","oracle","sqlite"]).optional(),
//       },
//     },
//     async ({ db: dbName, type }) => {
//       const { db: targetDb } = resolveTargetDb({ db: dbName, type });
//       const md = await describeSchema(targetDb);
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

//   // --------------------- sql.query ---------------------
//   server.registerTool(
//     name("sql.query"),
//     {
//       title: "Execute SQL",
//       description: [
//         "Execute a parameterized SQL query against the chosen database.",
//         "",
//         "If you provide 'db' (database name, not alias), the target DB is resolved at runtime.",
//         "Optionally provide 'type' to disambiguate databases with the same name.",
//         "",
//         "**Usage Tips:**",
//         sqlGuardrails(),
//       ].join("\n"),
//       inputSchema: {
//         db: z.string().optional().describe("Database name (not alias)"),
//         type: z.enum(["mysql","pg","mssql","oracle","sqlite"]).optional(),
//         sql: z.string(),
//         params: z.record(z.any()).optional().default({}),
//         readOnly: z.boolean().default(true),
//         rowLimit: z.number().int().min(1).max(10000).default(1000),
//         as: z.enum(["json", "markdown"]).default("json"),
//       },
//     },
//     async ({ db: dbName, type, sql, params, readOnly, rowLimit, as }) => {
//       const { db: targetDb } = resolveTargetDb({ db: dbName, type });
//       if (readOnly && !/^\s*select\b/i.test(sql)) {
//         throw new Error("readOnly mode: only SELECT is allowed.");
//       }
//       const { text, params: mapped } = mapNamedToDriver(sql, params ?? {}, targetDb.dialect);
//       const t0 = Date.now();
//       const { rows, rowCount } = await targetDb.query(text, mapped);
//       const ms = Date.now() - t0;
//       await audit(
//         `[${new Date().toISOString()}] ${targetDb.dialect} rows=${rowCount} ms=${ms} sql=${sql}`
//       );
//       const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
//       if (as === "markdown") {
//         return { content: [{ type: "text", text: toMarkdown(limited) }] };
//       }
//       return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
//     }
//   );
// }

// /* ------------------------- helpers ------------------------- */
// function toMarkdown(rows: any[]) {
//   if (!rows?.length) return "_(no rows)_";
//   const headers = Object.keys(rows[0]);
//   const top = `${headers.join(" | ")}\n`;
//   const sep = `${headers.map(() => "---").join(" | ")}\n`;
//   const body = rows.map((r) => `${headers.map((h) => fmt(r[h])).join(" | ")}`).join("\n");
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

// // ADDED: quote schema-qualified names safely for all dialects
// function quoteMaybeQualified(dialect: DB["dialect"], ident: string) {
//   if (ident.includes(".")) {
//     const [schema, name] = ident.split(".");
//     return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name)}`;
//   }
//   return quoteIdent(dialect, ident);
// }

// /** Discover base table names (no views), dialect-aware */
// async function listTables(db: DB): Promise<string[]> {
//   switch (db.dialect) {
//     case "pg": {
//       const sql = `
//         SELECT table_name
//         FROM information_schema.tables
//         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
//         ORDER BY table_name`;
//       const { rows } = await db.query<{ table_name: string }>(sql, []);
//       return rows.map((r) => r.table_name);
//     }
//     case "mysql": {
//       const sql = `
//         SELECT TABLE_NAME AS table_name
//         FROM information_schema.tables
//         WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
//         ORDER BY TABLE_NAME`;
//       const { rows } = await db.query<{ table_name: string }>(sql, []);
//       return rows.map((r) => r.table_name);
//     }
//     case "mssql": { // CHANGED: include schema
//       const sql = `
//         SELECT
//           TABLE_SCHEMA AS table_schema,
//           TABLE_NAME   AS table_name
//         FROM INFORMATION_SCHEMA.TABLES
//         WHERE TABLE_TYPE = 'BASE TABLE'
//         ORDER BY TABLE_SCHEMA, TABLE_NAME`;
//       const { rows } = await db.query<{ table_schema: string; table_name: string }>(sql, []);
//       // return rows.map((r) => `${r.table_schema}.${r.table_name}`);
//       return rows.map((r) => r.table_name);
//     }
//     case "oracle": {
//       // Prefer USER_TABLES (base tables only) instead of USER_TAB_COLUMNS (tables + views + clusters).
//       // Keep your explicit excludes; also hide any recycled/dropped objects.
//       const quoted = excludedOracleTables.map((name) => `'${name.toUpperCase()}'`).join(", ");
//       const sql = `
//         SELECT table_name AS "table_name"
//         FROM user_tables
//         WHERE temporary = 'N' -- exclude temporary tables
//           AND table_name NOT LIKE 'ROLLING$%' -- your existing patterns
//           AND table_name NOT LIKE 'SCHEDULER_%'
//           ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
//           AND table_name NOT IN (
//             SELECT object_name FROM user_recyclebin -- avoid BIN$... names
//           )
//         ORDER BY table_name`;
//       const { rows } = await db.query<{ table_name: string }>(sql, []);
//       return rows.map((r) => r.table_name);
//     }
//     case "sqlite": {
//       const sql = `
//         SELECT name AS table_name
//         FROM sqlite_master
//         WHERE type='table' AND name NOT LIKE 'sqlite_%'
//         ORDER BY name`;
//       const { rows } = await db.query<{ table_name: string }>(sql, []);
//       return rows.map((r) => r.table_name);
//     }
//   }
// }

// /** Fetch up to N rows from each table using dialect-correct limiting */
// async function dumpTables(db: DB, tables: string[], maxRows: number) {
//   const result: { table: string; rows: any[] }[] = [];
//   for (const t of tables) {
//     const qTable = quoteMaybeQualified(db.dialect, t); // CHANGED
//     let sql: string;
//     switch (db.dialect) {
//       case "pg":
//       case "mysql":
//       case "sqlite":
//         sql = `SELECT * FROM ${qTable} LIMIT :n`; // LIMIT dialects
//         break;
//       case "mssql":
//         // CHANGED: avoid parameterizing TOP to dodge driver quirks, use validated literal
//         sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`;
//         break;
//       case "oracle":
//         sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`; // ROWNUM for Oracle
//         break;
//     }
//     // For MSSQL we already inlined the literal; others still bind :n safely.
//     const { text, params } =
//       db.dialect === "mssql"
//         ? { text: sql, params: [] as any[] }
//         : mapNamedToDriver(sql, { n: maxRows }, db.dialect);

//     const { rows } = await db.query<any>(text, params);
//     result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
//   }
//   return result;
// }

// /** Compact schema outline — FILTERED by listTables() so it matches sql.peek */
// async function describeSchema(db: DB) {
//   const tables = await listTables(db);
//   const safeTables = Array.from(
//     new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0))
//   );
//   if (!safeTables.length) return "_(no tables)_";
//   switch (db.dialect) {
//     case "pg": {
//       const inList = safeTables.map((t) => `'${t}'`).join(", ");
//       const sql = `
//         SELECT table_name, column_name, data_type
//         FROM information_schema.columns
//         WHERE table_schema = 'public' AND table_name IN (${inList})
//         ORDER BY table_name, ordinal_position`;
//       return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
//     }
//     case "mysql": {
//       const inList = safeTables.map((t) => `'${t}'`).join(", ");
//       const sql = `
//         SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//         FROM information_schema.columns
//         WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
//         ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//       return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
//     }
//     case "mssql": { // CHANGED: support schema-qualified names
//       const q = safeTables.map((t) => {
//         if (t.includes(".")) {
//           const [schema, name] = t.split(".");
//           return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
//         }
//         return { schema: null as string | null, name: t.replace(/'/g, "''") };
//       });
//       const hasSchema = q.some((x) => !!x.schema);
//       let sql: string;

//       if (hasSchema) {
//         const orConds = q
//           .map((x) =>
//             x.schema
//               ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
//               : `(TABLE_NAME = '${x.name}')`
//           )
//           .join(" OR ");

//         sql = `
//           SELECT
//             CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name,
//             COLUMN_NAME AS column_name,
//             DATA_TYPE   AS data_type
//           FROM INFORMATION_SCHEMA.COLUMNS
//           WHERE ${orConds}
//           ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
//       } else {
//         const inList = q.map((x) => `'${x.name}'`).join(", ");
//         sql = `
//           SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//           FROM INFORMATION_SCHEMA.COLUMNS
//           WHERE TABLE_NAME IN (${inList})
//           ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//       }

//       return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
//     }
//     case "oracle": {
//       const inList = safeTables.map((t) => `'${t.toUpperCase()}'`).join(", ");
//       const sql = `
//         SELECT
//           table_name AS "table_name",
//           column_name AS "column_name",
//           CASE
//             WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR','NCHAR') AND data_length IS NOT NULL
//               THEN data_type || '(' || data_length || ')'
//             WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL
//               THEN data_type || '(' || data_precision || NVL2(data_scale, ','||data_scale, '') || ')'
//             ELSE data_type
//           END AS "data_type"
//         FROM user_tab_columns
//         WHERE UPPER(table_name) IN (${inList})
//         ORDER BY table_name, column_id`;
//       return await describeViaQuery<Record<string, any>>(db, sql, "table_name", "column_name", "data_type");
//     }
//     case "sqlite": {
//       const parts: string[] = [];
//       for (const t of safeTables) {
//         const pragma = `PRAGMA table_info(${quoteIdent(db.dialect, t)});`;
//         const { rows } = await db.query<{ name: string; type: string }>(pragma, []);
//         if (!rows?.length) continue;
//         const body = rows.map((r) => `- ${r.name} \`${r.type}\``).join("\n");
//         parts.push(`## ${t}\n\n${body}`);
//       }
//       return parts.join("\n\n") || "_(no tables)_";
//     }
//   }
// }

// async function describeViaQuery<T extends Record<string, any>>(
//   db: DB,
//   sql: string,
//   tableKey: string,
//   columnKey: string,
//   typeKey: string
// ): Promise<string> {
//   const { rows } = await db.query<T>(sql, []);
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





























// src/tools/sql/index.ts
// import { z } from "zod";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import type { DB } from "../../db/provider.js";
// import type { DbAliasMeta } from "../../db/registry.js";
// import { mapNamedToDriver } from "../../db/paramMap.js";
// import { sqlGuardrails } from "./templates.js";
// import { excludedOracleTables } from "./unwantedOracle.js";

// // ----- Per-server tracking (no process-global singletons) -----
// const serverAliases = new WeakMap<McpServer, Set<string>>();
// const discoveryRegistered = new WeakSet<McpServer>();

// export function registerSqlTools(
//   server: McpServer,
//   {
//     db,
//     auditPath,
//     ns,
//     meta,
//     registry,
//   }: {
//     db: DB;
//     auditPath?: string;
//     ns?: string;
//     meta: Map<string, DbAliasMeta>;
//     registry: Map<string, DB>;
//   }
// ) {
//   const name = (base: string) => (ns ? `${ns}.${base}` : base);

//   // Track aliases per server
//   if (ns) {
//     const set = serverAliases.get(server) ?? new Set<string>();
//     set.add(ns);
//     serverAliases.set(server, set);
//   }

//   // ----- Register discovery tools once PER SERVER -----
//   if (!discoveryRegistered.has(server)) {
//     discoveryRegistered.add(server);

//     // db.aliases
//     server.registerTool(
//       "db.aliases",
//       {
//         title: "List databases aliases",
//         description:
//           "Return the list of available database aliases on this server (e.g., mysql, mssql, mssql_2, pg, oracle).",
//         inputSchema: {}, // ZodRawShape
//       },
//       async (_args, _extra) => {
//         const aliases = Array.from(serverAliases.get(server) ?? new Set<string>()).sort();
//         return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
//       }
//     );

//     // db.types
//     server.registerTool(
//       "db.types",
//       {
//         title: "List available database (types)",
//         description: "List available database dialects (types), e.g., MySQL, PostgreSQL, MSSQL, Oracle.",
//         inputSchema: {},
//       },
//       async () => {
//         const types = Array.from(new Set(Array.from(meta.values()).map(m => m.dialect))).sort();
//         return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
//       }
//     );

//     // db.names
//     server.registerTool(
//       "db.names",
//       {
//         title: "List database names",
//         description: "List database names (not aliases) across all configured databases (unique, sorted).",
//         inputSchema: {},
//       },
//       async () => {
//         const names = Array.from(
//           new Set(Array.from(meta.values()).map(m => m.databaseName).filter(Boolean))
//         ).sort((a, b) => a.localeCompare(b));
//         return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//       }
//     );

//     // db.listByType
//     server.registerTool(
//       "db.listByType",
//       {
//         title: "List databases by type",
//         description:
//           "List database names for a given dialect. unique=true returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
//         inputSchema: {
//           type: z.string().min(1).describe("Dialect: mysql\npg\nmssql\noracle\nsqlite"),
//           unique: z.boolean().default(true),
//           includeAliases: z.boolean().default(false),
//         },
//       },
//       async (args) => {
//         const dialect = String(args?.type ?? "").trim();
//         const unique = args?.unique ?? true;
//         const includeAliases = args?.includeAliases ?? false;

//         if (!dialect) {
//           return {
//             isError: true,
//             content: [{ type: "text", text: JSON.stringify({ error: "Missing required 'type'." }) }],
//           };
//         }

//         const items = Array.from(meta.values()).filter(m => m.dialect === dialect);
//         if (unique) {
//           const names = Array.from(new Set(items.map(i => i.databaseName).filter(Boolean))).sort((a, b) =>
//             a.localeCompare(b)
//           );
//           return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//         }

//         const rows = items
//           .map(i => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
//           .sort(
//             (a: any, b: any) =>
//               String(a.name).localeCompare(String(b.name)) ||
//               (a.alias !== undefined && b.alias !== undefined
//                 ? String(a.alias).localeCompare(String(b.alias))
//                 : 0)
//           );
//         return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
//       }
//     );
//   }

//   async function audit(line: string) {
//     if (!auditPath) return;
//     const fs = await import("node:fs/promises");
//     await fs.appendFile(auditPath, line + "\n", "utf8");
//   }

//   // ---------- Helpers copied from your previous version ----------
//   function toMarkdown(rows: any[]) {
//     if (!rows?.length) return "_(no rows)_";
//     const headers = Object.keys(rows[0]);
//     const top = `${headers.join(" | ")}\n`;
//     const sep = `${headers.map(() => "---").join(" | ")}\n`;
//     const body = rows.map(r => `${headers.map(h => fmt(r[h])).join(" | ")}`).join("\n");
//     return [top, sep, body].join("");
//   }
//   function fmt(v: unknown) {
//     if (v === null || v === undefined) return "";
//     if (typeof v === "object") return "```json\n" + JSON.stringify(v) + "\n```";
//     return String(v);
//   }
//   function quoteIdent(dialect: DB["dialect"], ident: string) {
//     switch (dialect) {
//       case "pg":
//       case "oracle":
//       case "sqlite": {
//         const safe = ident.replace(/"/g, '""');
//         return `"${safe}"`;
//       }
//       case "mysql": {
//         const safe = ident.replace(/`/g, "``");
//         return `\`${safe}\``;
//       }
//       case "mssql": {
//         const safe = ident.replace(/]/g, "]]");
//         return `[${safe}]`;
//       }
//     }
//   }
//   function quoteMaybeQualified(dialect: DB["dialect"], ident: string) {
//     if (ident.includes(".")) {
//       const [schema, name] = ident.split(".");
//       return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name)}`;
//     }
//     return quoteIdent(dialect, ident);
//   }
//   async function listTables(dbX: DB): Promise<string[]> {
//     switch (dbX.dialect) {
//       case "pg": {
//         const sql = `
//           SELECT table_name
//           FROM information_schema.tables
//           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
//           ORDER BY table_name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "mysql": {
//         const sql = `
//           SELECT TABLE_NAME AS table_name
//           FROM information_schema.tables
//           WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
//           ORDER BY TABLE_NAME`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "mssql": {
//         const sql = `
//           SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
//           FROM INFORMATION_SCHEMA.TABLES
//           WHERE TABLE_TYPE = 'BASE TABLE'
//           ORDER BY TABLE_SCHEMA, TABLE_NAME`;
//         const { rows } = await db.query<{ table_schema: string; table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "oracle": {
//         const quoted = excludedOracleTables.map(name => `'${name.toUpperCase()}'`).join(", ");
//         const sql = `
//           SELECT table_name AS "table_name"
//           FROM user_tables
//           WHERE temporary = 'N'
//             AND table_name NOT LIKE 'ROLLING$%'
//             AND table_name NOT LIKE 'SCHEDULER_%'
//             ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
//             AND table_name NOT IN (SELECT object_name FROM user_recyclebin)
//           ORDER BY table_name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "sqlite": {
//         const sql = `
//           SELECT name AS table_name
//           FROM sqlite_master
//           WHERE type='table' AND name NOT LIKE 'sqlite_%'
//           ORDER BY name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//     }
//   }
//   async function dumpTables(dbX: DB, tables: string[], maxRows: number) {
//     const result: { table: string; rows: any[] }[] = [];
//     for (const t of tables) {
//       const qTable = quoteMaybeQualified(dbX.dialect, t);
//       let sql: string;
//       switch (dbX.dialect) {
//         case "pg":
//         case "mysql":
//         case "sqlite":
//           sql = `SELECT * FROM ${qTable} LIMIT :n`;
//           break;
//         case "mssql":
//           sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`;
//           break;
//         case "oracle":
//           sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`;
//           break;
//       }
//       const { text, params } =
//         dbX.dialect === "mssql"
//           ? { text: sql, params: [] as any[] }
//           : mapNamedToDriver(sql, { n: maxRows }, dbX.dialect);
//       const { rows } = await db.query<any>(text, params);
//       result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
//     }
//     return result;
//   }
//   async function describeViaQuery<T extends Record<string, any>>(
//     dbX: DB,
//     sql: string,
//     tableKey: string,
//     columnKey: string,
//     typeKey: string
//   ): Promise<string> {
//     const { rows } = await db.query<T>(sql, []);
//     const m = new Map<string, string[]>();
//     for (const r of rows) {
//       const t = r[tableKey];
//       const c = r[columnKey];
//       const d = r[typeKey];
//       if (!t || !c) continue;
//       const list = m.get(t) ?? [];
//       list.push(`${c} ${d ?? ""}`.trim());
//       m.set(t, list);
//     }
//     return [...m.entries()]
//       .map(([t, cols]) => `### ${t}\n- ${cols.join("\n- ")}`)
//       .join("\n\n") || "_(no tables)_";
//   }
//   async function describeSchema(dbX: DB) {
//     const tables = await listTables(dbX);
//     const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
//     if (!safeTables.length) return "_(no tables)_";

//     switch (dbX.dialect) {
//       case "pg": {
//         const inList = safeTables.map(t => `'${t}'`).join(", ");
//         const sql = `
//           SELECT table_name, column_name, data_type
//           FROM information_schema.columns
//           WHERE table_schema = 'public' AND table_name IN (${inList})
//           ORDER BY table_name, ordinal_position`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "mysql": {
//         const inList = safeTables.map(t => `'${t}'`).join(", ");
//         const sql = `
//           SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//           FROM information_schema.columns
//           WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
//           ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "mssql": {
//         const q = safeTables.map(t => {
//           if (t.includes(".")) {
//             const [schema, name] = t.split(".");
//             return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
//           }
//           return { schema: null as string | null, name: t.replace(/'/g, "''") };
//         });
//         const hasSchema = q.some(x => !!x.schema);
//         let sql: string;
//         if (hasSchema) {
//           const orConds = q
//             .map(x =>
//               x.schema
//                 ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
//                 : `(TABLE_NAME = '${x.name}')`
//             )
//             .join(" OR ");
//           sql = `
//             SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//             FROM INFORMATION_SCHEMA.COLUMNS
//             WHERE ${orConds}
//             ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
//         } else {
//           const inList = q.map(x => `'${x.name}'`).join(", ");
//           sql = `
//             SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//             FROM INFORMATION_SCHEMA.COLUMNS
//             WHERE TABLE_NAME IN (${inList})
//             ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//         }
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "oracle": {
//         const inList = safeTables.map(t => `'${t.toUpperCase()}'`).join(", ");
//         const sql = `
//           SELECT
//             table_name AS "table_name",
//             column_name AS "column_name",
//             CASE
//               WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR','NCHAR') AND data_length IS NOT NULL
//                 THEN data_type || '(' || data_length || ')'
//               WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL
//                 THEN data_type || '(' || data_precision || NVL2(data_scale, ',' || data_scale, '') || ')'
//               ELSE data_type
//             END AS "data_type"
//           FROM user_tab_columns
//           WHERE UPPER(table_name) IN (${inList})
//           ORDER BY table_name, column_id`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "sqlite": {
//         const parts: string[] = [];
//         for (const t of safeTables) {
//           const pragma = `PRAGMA table_info(${quoteIdent(dbX.dialect, t)});`;
//           const { rows } = await db.query<{ name: string; type: string }>(pragma, []);
//           if (!rows?.length) continue;
//           const body = rows.map(r => `- ${r.name} \`${r.type}\``).join("\n");
//           parts.push(`## ${t}\n\n${body}`);
//         }
//         return parts.join("\n\n") || "_(no tables)_";
//       }
//     }
//   }

//   // ---------- Namespaced tools for this alias ----------
//   server.registerTool(
//     name("sql.peek"),
//     {
//       title: "Peek into database content",
//       description: [
//         "Return up to N rows from each base table in the chosen database.",
//         "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
//         "",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' (mysql\npg\nmssql\noracle\nsqlite) to disambiguate.",
//       ].join("\n"),
//       inputSchema: {
//         maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
//         as: z.enum(["markdown", "json"]).default("markdown"),
//       },
//     },
//     async ({ maxRowsPerTable, as }) => {
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

//   server.registerTool(
//     name("sql.schema"),
//     {
//       title: "Describe schema",
//       description: [
//         "Return a compact Markdown outline of tables and columns for the chosen database.",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' to disambiguate.",
//       ].join("\n"),
//       inputSchema: {},
//     },
//     async () => {
//       const md = await describeSchema(db);
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

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
//         params: z.record(z.any()).optional().default({}),
//         readOnly: z.boolean().default(true),
//         rowLimit: z.number().int().min(1).max(10000).default(1000),
//         as: z.enum(["json", "markdown"]).default("json"),
//       },
//     },
//     async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }) => {
//       if (readOnly && !/^\s*select\b/i.test(sql)) {
//         throw new Error("readOnly mode: only SELECT is allowed.");
//       }
//       const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//       const t0 = Date.now();
//       const { rows, rowCount } = await db.query(text, mapped);
//       const ms = Date.now() - t0;

//       const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
//       await audit(`[${new Date().toISOString()}] ${db.dialect} rows=${rowCount ?? limited?.length ?? 0} ms=${ms} sql=${sql}`);

//       if (as === "markdown") {
//         return { content: [{ type: "text", text: toMarkdown(limited) }] };
//       }
//       return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
//     }
//   );
// }







































// import { z } from "zod";
// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import type { DB } from "../../db/provider.js";
// import type { DbAliasMeta } from "../../db/registry.js";
// import { mapNamedToDriver } from "../../db/paramMap.js";
// import { sqlGuardrails } from "./templates.js";
// import { excludedOracleTables } from "./unwantedOracle.js";

// // ---- Per-server tracking (no globals) ----
// const serverAliases = new WeakMap<McpServer, Set<string>>();
// const discoveryRegistered = new WeakSet<McpServer>();

// export function registerSqlTools(
//   server: McpServer,
//   {
//     db,
//     auditPath,
//     ns,
//     meta,
//     registry,
//     tools,
//   }: {
//     db: DB;
//     auditPath?: string;
//     ns?: string;
//     meta: Map<string, DbAliasMeta>;
//     registry: Map<string, DB>;
//     tools?: { schema?: boolean; peek?: boolean; query?: boolean };
//   }
// ) {
//   const name = (base: string) => (ns ? `${ns}.${base}` : base);

//   // Track aliases per server
//   if (ns) {
//     const set = serverAliases.get(server) ?? new Set<string>();
//     set.add(ns);
//     serverAliases.set(server, set);
//   }

//   // ---- Register discovery tools once PER SERVER ----
//   if (!discoveryRegistered.has(server)) {
//     discoveryRegistered.add(server);

//     // NEW: only expose meta for aliases actually registered on this server (session)
//     const metaVisible = () => {
//       const allowed = serverAliases.get(server) ?? new Set<string>();
//       const out: DbAliasMeta[] = [];
//       for (const [alias, m] of meta.entries()) {
//         if (allowed.has(alias)) out.push({ ...m });
//       }
//       return out;
//     };

//     // db.aliases (already session-scoped)
//     server.registerTool(
//       "db.aliases",
//       {
//         title: "List databases aliases",
//         description: "Return the list of available database aliases on this server (e.g., hr, finance, library).",
//         inputSchema: {},
//       },
//       async () => {
//         const aliases = Array.from(serverAliases.get(server) ?? new Set<string>()).sort();
//         return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
//       }
//     );

//     // db.types (FILTERED)
//     server.registerTool(
//       "db.types",
//       {
//         title: "List available database (types)",
//         description: "List available database dialects (types) visible in this session.",
//         inputSchema: {},
//       },
//       async () => {
//         const visible = metaVisible();
//         const types = Array.from(new Set(visible.map(m => m.dialect))).sort();
//         return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
//       }
//     );

//     // db.names (FILTERED)
//     server.registerTool(
//       "db.names",
//       {
//         title: "List database names",
//         description: "List database names (not aliases) visible in this session (unique, sorted).",
//         inputSchema: {},
//       },
//       async () => {
//         const visible = metaVisible();
//         const names = Array.from(new Set(visible.map(m => m.databaseName).filter(Boolean))).sort(
//           (a, b) => a.localeCompare(b)
//         );
//         return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//       }
//     );

//     // db.listByType (FILTERED)
//     server.registerTool(
//       "db.listByType",
//       {
//         title: "List databases by type",
//         description:
//           "List database names for a given dialect. unique=true returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
//         inputSchema: {
//           type: z.string().min(1).describe("Dialect: mysql\npg\nmssql\noracle\nsqlite"),
//           unique: z.boolean().default(true),
//           includeAliases: z.boolean().default(false),
//         },
//       },
//       async (args) => {
//         const dialect = String(args?.type ?? "").trim();
//         const unique = args?.unique ?? true;
//         const includeAliases = args?.includeAliases ?? false;
//         if (!dialect) {
//           return {
//             isError: true,
//             content: [{ type: "text", text: JSON.stringify({ error: "Missing required 'type'." }) }],
//           };
//         }
//         const visible = metaVisible().filter(m => m.dialect === dialect);
//         if (unique) {
//           const names = Array.from(new Set(visible.map(i => i.databaseName).filter(Boolean))).sort(
//             (a, b) => a.localeCompare(b)
//           );
//           return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
//         }
//         const rows = visible
//           .map(i => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
//           .sort(
//             (a: any, b: any) =>
//               String(a.name).localeCompare(String(b.name)) ||
//               (a.alias !== undefined && b.alias !== undefined
//                 ? String(a.alias).localeCompare(String(b.alias))
//                 : 0)
//           );
//         return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
//       }
//     );
//   }

//   async function audit(line: string) {
//     if (!auditPath) return;
//     const fs = await import("node:fs/promises");
//     await fs.appendFile(auditPath, line + "\n", "utf8");
//   }

//   // ---- Helpers (unchanged) ----
//   function toMarkdown(rows: any[]) {
//     if (!rows?.length) return "_(no rows)_";
//     const headers = Object.keys(rows[0]);
//     const top = `${headers.join(" | ")}\n`;
//     const sep = `${headers.map(() => "---").join(" | ")}\n`;
//     const body = rows.map(r => `${headers.map(h => fmt(r[h])).join(" | ")}`).join("\n");
//     return [top, sep, body].join("");
//   }
//   function fmt(v: unknown) {
//     if (v === null || v === undefined) return "";
//     if (typeof v === "object") return "```json\n" + JSON.stringify(v) + "\n```";
//     return String(v);
//   }
//   function quoteIdent(dialect: DB["dialect"], ident: string) {
//     switch (dialect) {
//       case "pg":
//       case "oracle":
//       case "sqlite": {
//         const safe = ident.replace(/"/g, '""');
//         return `"${safe}"`;
//       }
//       case "mysql": {
//         const safe = ident.replace(/`/g, "``");
//         return `\`${safe}\``;
//       }
//       case "mssql": {
//         const safe = ident.replace(/]/g, "]]");
//         return `[${safe}]`;
//       }
//     }
//   }
//   function quoteMaybeQualified(dialect: DB["dialect"], ident: string) {
//     if (ident.includes(".")) {
//       const [schema, name] = ident.split(".");
//       return `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name)}`;
//     }
//     return quoteIdent(dialect, ident);
//   }

//   async function listTables(dbX: DB): Promise<string[]> {
//     switch (dbX.dialect) {
//       case "pg": {
//         const sql = `
//           SELECT table_name
//           FROM information_schema.tables
//           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
//           ORDER BY table_name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "mysql": {
//         const sql = `
//           SELECT TABLE_NAME AS table_name
//           FROM information_schema.tables
//           WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
//           ORDER BY TABLE_NAME`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "mssql": {
//         const sql = `
//           SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
//           FROM INFORMATION_SCHEMA.TABLES
//           WHERE TABLE_TYPE = 'BASE TABLE'
//           ORDER BY TABLE_SCHEMA, TABLE_NAME`;
//         const { rows } = await db.query<{ table_schema: string; table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "oracle": {
//         const quoted = excludedOracleTables.map(name => `'${name.toUpperCase()}'`).join(", ");
//         const sql = `
//           SELECT table_name AS "table_name"
//           FROM user_tables
//           WHERE temporary = 'N'
//           AND table_name NOT LIKE 'ROLLING$%'
//           AND table_name NOT LIKE 'SCHEDULER_%'
//           ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
//           AND table_name NOT IN (SELECT object_name FROM user_recyclebin)
//           ORDER BY table_name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//       case "sqlite": {
//         const sql = `
//           SELECT name AS table_name
//           FROM sqlite_master
//           WHERE type='table' AND name NOT LIKE 'sqlite_%'
//           ORDER BY name`;
//         const { rows } = await db.query<{ table_name: string }>(sql, []);
//         return rows.map(r => r.table_name);
//       }
//     }
//   }

//   async function dumpTables(dbX: DB, tables: string[], maxRows: number) {
//     const result: { table: string; rows: any[] }[] = [];
//     for (const t of tables) {
//       const qTable = quoteMaybeQualified(dbX.dialect, t);
//       let sql: string;
//       switch (dbX.dialect) {
//         case "pg":
//         case "mysql":
//         case "sqlite":
//           sql = `SELECT * FROM ${qTable} LIMIT :n`;
//           break;
//         case "mssql":
//           sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`;
//           break;
//         case "oracle":
//           sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`;
//           break;
//       }
//       const { text, params } =
//         dbX.dialect === "mssql" ? { text: sql, params: [] as any[] } : mapNamedToDriver(sql, { n: maxRows }, dbX.dialect);
//       const { rows } = await db.query<any>(text, params);
//       result.push({ table: t, rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [] });
//     }
//     return result;
//   }

//   async function describeViaQuery<T extends Record<string, any>>(
//     dbX: DB,
//     sql: string,
//     tableKey: string,
//     columnKey: string,
//     typeKey: string
//   ): Promise<string> {
//     const { rows } = await db.query<T>(sql, []);
//     const m = new Map<string, string[]>();
//     for (const r of rows) {
//       const t = r[tableKey];
//       const c = r[columnKey];
//       const d = r[typeKey];
//       if (!t || !c) continue;
//       const list = m.get(t) ?? [];
//       list.push(`${c} ${d ?? ""}`.trim());
//       m.set(t, list);
//     }
//     return [...m.entries()]
//       .map(([t, cols]) => `### ${t}\n- ${cols.join("\n- ")}`)
//       .join("\n\n") || "_(no tables)_";
//   }

//   async function describeSchema(dbX: DB) {
//     const tables = await listTables(dbX);
//     const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
//     if (!safeTables.length) return "_(no tables)_";
//     switch (dbX.dialect) {
//       case "pg": {
//         const inList = safeTables.map(t => `'${t}'`).join(", ");
//         const sql = `
//           SELECT table_name, column_name, data_type
//           FROM information_schema.columns
//           WHERE table_schema = 'public' AND table_name IN (${inList})
//           ORDER BY table_name, ordinal_position`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "mysql": {
//         const inList = safeTables.map(t => `'${t}'`).join(", ");
//         const sql = `
//           SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//           FROM information_schema.columns
//           WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
//           ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "mssql": {
//         const q = safeTables.map(t => {
//           if (t.includes(".")) {
//             const [schema, name] = t.split(".");
//             return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
//           }
//           return { schema: null as string | null, name: t.replace(/'/g, "''") };
//         });
//         const hasSchema = q.some(x => !!x.schema);
//         let sql: string;
//         if (hasSchema) {
//           const orConds = q
//             .map(x => (x.schema
//               ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
//               : `(TABLE_NAME = '${x.name}')`))
//             .join(" OR ");
//           sql = `
//             SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//             FROM INFORMATION_SCHEMA.COLUMNS
//             WHERE ${orConds}
//             ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
//         } else {
//           const inList = q.map(x => `'${x.name}'`).join(", ");
//           sql = `
//             SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
//             FROM INFORMATION_SCHEMA.COLUMNS
//             WHERE TABLE_NAME IN (${inList})
//             ORDER BY TABLE_NAME, ORDINAL_POSITION`;
//         }
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "oracle": {
//         const inList = safeTables.map(t => `'${t.toUpperCase()}'`).join(", ");
//         const sql = `
//           SELECT
//             table_name AS "table_name",
//             column_name AS "column_name",
//             CASE
//               WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR','NCHAR') AND data_length IS NOT NULL
//                 THEN data_type || '(' || data_length || ')'
//               WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL
//                 THEN data_type || '(' || data_precision || NVL2(data_scale, ',' || data_scale, '') || ')'
//               ELSE data_type
//             END AS "data_type"
//           FROM user_tab_columns
//           WHERE UPPER(table_name) IN (${inList})
//           ORDER BY table_name, column_id`;
//         return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
//       }
//       case "sqlite": {
//         const parts: string[] = [];
//         for (const t of safeTables) {
//           const pragma = `PRAGMA table_info(${quoteIdent(dbX.dialect, t)});`;
//           const { rows } = await db.query<{ name: string; type: string }>(pragma, []);
//           if (!rows?.length) continue;
//           const body = rows.map(r => `- ${r.name} \`${r.type}\``).join("\n");
//           parts.push(`## ${t}\n\n${body}`);
//         }
//         return parts.join("\n\n") || "_(no tables)_";
//       }
//     }
//   }

//   // ---- Namespaced tools for this alias ----
//   server.registerTool(
//     name("sql.peek"),
//     {
//       title: "Peek into database content",
//       description: [
//         "Return up to N rows from each base table in the chosen database.",
//         "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
//         "",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' (mysql\npg\nmssql\noracle\nsqlite) to disambiguate.",
//       ].join("\n"),
//       inputSchema: {
//         maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
//         as: z.enum(["markdown", "json"]).default("markdown"),
//       },
//     },
//     async ({ maxRowsPerTable, as }) => {
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

//   server.registerTool(
//     name("sql.schema"),
//     {
//       title: "Describe schema",
//       description: [
//         "Return a compact Markdown outline of tables and columns for the chosen database.",
//         "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
//         "Optionally provide 'type' to disambiguate.",
//       ].join("\n"),
//       inputSchema: {},
//     },
//     async () => {
//       const md = await describeSchema(db);
//       return { content: [{ type: "text", text: md }] };
//     }
//   );

//   server.registerTool(
//     name("sql.query"),
//     {
//       title: "Execute SQL",
//       description: ["Execute a parameterized SQL query against the chosen database.", "", "**Usage Tips:**", sqlGuardrails()].join("\n"),
//       inputSchema: {
//         sql: z.string(),
//         params: z.record(z.any()).optional().default({}),
//         readOnly: z.boolean().default(true),
//         rowLimit: z.number().int().min(1).max(10000).default(1000),
//         as: z.enum(["json", "markdown"]).default("json"),
//       },
//     },
//     async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }) => {
//       if (readOnly && !/^\s*select\b/i.test(sql)) {
//         throw new Error("readOnly mode: only SELECT is allowed.");
//       }
//       const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
//       const t0 = Date.now();
//       const { rows, rowCount } = await db.query(text, mapped);
//       const ms = Date.now() - t0;
//       const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
//       await audit(`[${new Date().toISOString()}] ${db.dialect} rows=${rowCount ?? limited?.length ?? 0} ms=${ms} sql=${sql}`);
//       if (as === "markdown") {
//         return { content: [{ type: "text", text: toMarkdown(limited) }] };
//       }
//       return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
//     }
//   );
// }


































import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../../db/provider.js";
import type { DbAliasMeta } from "../../db/registry.js";
import { mapNamedToDriver } from "../../db/paramMap.js";
import { sqlGuardrails } from "./templates.js";
import { excludedOracleTables } from "./unwantedOracle.js";

// ---- Per-server tracking (no globals) ----
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
    // NEW: optional controls for tool-level RBAC & discovery tools visibility
    tools,                 // { schema?: boolean; peek?: boolean; query?: boolean }
    dataPolicy,
    userContext,
    discoveryVisible,      // boolean; if false, do NOT register discovery tools
  }: {
    db: DB;
    auditPath?: string;
    ns?: string;
    meta: Map<string, DbAliasMeta>;
    registry: Map<string, DB>;
    tools?: { schema?: boolean; peek?: boolean; query?: boolean };
    dataPolicy?: { readOnly?: boolean; tableAllow?: string[]; rowFilters?: Record<string,string> };
    userContext?: { user_id?: string };
    discoveryVisible?: boolean;
  }
) {
  const name = (base: string) => (ns ? `${ns}.${base}` : base);

  // Track aliases per server
  if (ns) {
    const set = serverAliases.get(server) ?? new Set<string>();
    set.add(ns);
    serverAliases.set(server, set);
  }

  // ---- Register discovery tools once PER SERVER (admin-only via discoveryVisible) ----
  if (!discoveryRegistered.has(server)) {
    discoveryRegistered.add(server);

    if (discoveryVisible !== false) {
      const metaVisible = () => {
        const allowed = serverAliases.get(server) ?? new Set<string>();
        const out: DbAliasMeta[] = [];
        for (const [alias, m] of meta.entries()) {
          if (allowed.has(alias)) out.push({ ...m });
        }
        return out;
      };

      // db.aliases
      server.registerTool(
        "db.aliases",
        {
          title: "List databases aliases",
          description: "Return the list of available database aliases on this server (e.g., hr, finance, library).",
          inputSchema: {},
        },
        async () => {
          // const aliases = Array.from(serverAliases.get(server) ?? new Set<string>()).sort();
          // return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
          
          try {
            const set = serverAliases.get(server) ?? new Set<string>();
            const aliases = Array.from(set).sort();
            return { content: [{ type: "text", text: JSON.stringify(aliases, null, 2) }] };
          } catch (e: any) {
            console.error("[db.aliases] failed:", e);
            return { isError: true, content: [{ type: "text", text: `db.aliases failed: ${e?.message ?? String(e)}` }] };
          }

        }
      );

      // db.types (filtered)
      // server.registerTool(
      //   "db.types",
      //   {
      //     title: "List available database (types)",
      //     description: "List available database dialects (types) visible in this session.",
      //     inputSchema: {},
      //   },
      //   async () => {
      //     const visible = metaVisible();
      //     const types = Array.from(new Set(visible.map(m => m.dialect))).sort();
      //     return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
      //   }
      // );
      server.registerTool(
        "db.types",
        {
          title: "List available database (types)",
          description: "List available database dialects (types) visible in this session.",
          inputSchema: {},
        },
        async () => {
          try {
            const visible = metaVisible() || [];  // fallback if undefined
            const types = Array.from(new Set(visible.map(m => m.dialect))).sort();
            return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
          } catch (e: any) {
            console.error("[db.types] failed:", e);
            return {
              isError: true,
              content: [{ type: "text", text: `db.types failed: ${e?.message ?? String(e)}` }]
            };
          }
        }
      );





      // db.names (filtered)
      server.registerTool(
        "db.names",
        {
          title: "List database names",
          description: "List database names (not aliases) visible in this session (unique, sorted).",
          inputSchema: {},
        },
        async () => {
          const visible = metaVisible();
          const names = Array.from(new Set(visible.map(m => m.databaseName).filter(Boolean))).sort(
            (a, b) => a.localeCompare(b)
          );
          return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
        }
      );

      // db.listByType (filtered)
      server.registerTool(
        "db.listByType",
        {
          title: "List databases by type",
          description:
            "List database names for a given dialect. unique=true returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.",
          inputSchema: {
            type: z.string().min(1).describe("Dialect: mysql\npg\nmssql\noracle\nsqlite"),
            unique: z.boolean().default(true),
            includeAliases: z.boolean().default(false),
          },
        },
        async (args) => {
          const dialect = String(args?.type ?? "").trim();
          const unique = args?.unique ?? true;
          const includeAliases = args?.includeAliases ?? false;
          if (!dialect) {
            return {
              isError: true,
              content: [{ type: "text", text: JSON.stringify({ error: "Missing required 'type'." }) }],
            };
          }
          const visible = ((): DbAliasMeta[] => {
            const allowed = serverAliases.get(server) ?? new Set<string>();
            const out: DbAliasMeta[] = [];
            for (const [alias, m] of meta.entries()) if (allowed.has(alias)) out.push({ ...m });
            return out;
          })().filter(m => m.dialect === dialect);
          if (unique) {
            const names = Array.from(new Set(visible.map(i => i.databaseName).filter(Boolean))).sort(
              (a, b) => a.localeCompare(b)
            );
            return { content: [{ type: "text", text: JSON.stringify(names, null, 2) }] };
          }
          const rows = visible
            .map(i => (includeAliases ? { alias: i.alias, name: i.databaseName } : { name: i.databaseName }))
            .sort(
              (a: any, b: any) =>
                String(a.name).localeCompare(String(b.name)) ||
                (a.alias !== undefined && b.alias !== undefined
                  ? String(a.alias).localeCompare(String(b.alias))
                  : 0)
            );
          return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        }
      );
    }
  }

  async function audit(line: string) {
    if (!auditPath) return;
    const fs = await import("node:fs/promises");
    await fs.appendFile(auditPath, line + "\n", "utf8");
  }

  // ---- Helpers (unchanged) ----
  function toMarkdown(rows: any[]) {
    if (!rows?.length) return "_(no rows)_";
    const headers = Object.keys(rows[0]);
    const top = `${headers.join(" | ")}\n`;
    const sep = `${headers.map(() => "---").join(" | ")}\n`;
    const body = rows.map(r => `${headers.map(h => fmt(r[h])).join(" | ")}`).join("\n");
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
        const { rows } = await db.query<{ table_name: string }>(sql, []);
        return rows.map(r => r.table_name);
      }
      case "mysql": {
        const sql = `
          SELECT TABLE_NAME AS table_name
          FROM information_schema.tables
          WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME`;
        const { rows } = await db.query<{ table_name: string }>(sql, []);
        return rows.map(r => r.table_name);
      }
      case "mssql": {
        const sql = `
          SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_SCHEMA, TABLE_NAME`;
        const { rows } = await db.query<{ table_schema: string; table_name: string }>(sql, []);
        return rows.map(r => r.table_name);
      }
      case "oracle": {
        const quoted = excludedOracleTables.map(name => `'${name.toUpperCase()}'`).join(", ");
        const sql = `
          SELECT table_name AS "table_name"
          FROM user_tables
          WHERE temporary = 'N'
          AND table_name NOT LIKE 'ROLLING$%'
          AND table_name NOT LIKE 'SCHEDULER_%'
          ${excludedOracleTables.length ? `AND table_name NOT IN (${quoted})` : ""}
          AND table_name NOT IN (SELECT object_name FROM user_recyclebin)
          ORDER BY table_name`;
        const { rows } = await db.query<{ table_name: string }>(sql, []);
        return rows.map(r => r.table_name);
      }
      case "sqlite": {
        const sql = `
          SELECT name AS table_name
          FROM sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`;
        const { rows } = await db.query<{ table_name: string }>(sql, []);
        return rows.map(r => r.table_name);
      }
    }
  }

  async function dumpTables(dbX: DB, tables: string[], maxRows: number) {
    const result: { table: string; rows: any[] }[] = [];
    for (const t of tables) {
      const qTable = quoteMaybeQualified(dbX.dialect, t);
      let sql: string;
      switch (dbX.dialect) {
        case "pg":
        case "mysql":
        case "sqlite":
          sql = `SELECT * FROM ${qTable} LIMIT :n`;
          break;
        case "mssql":
          sql = `SELECT TOP (${maxRows}) * FROM ${qTable}`;
          break;
        case "oracle":
          sql = `SELECT * FROM ${qTable} WHERE ROWNUM <= :n`;
          break;
      }
      const { text, params } =
        dbX.dialect === "mssql" ? { text: sql, params: [] as any[] } : mapNamedToDriver(sql, { n: maxRows }, dbX.dialect);
      const { rows } = await db.query<any>(text, params);
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

  async function describeSchema(dbX: DB) {
    const tables = await listTables(dbX);
    const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
    if (!safeTables.length) return "_(no tables)_";
    switch (dbX.dialect) {
      case "pg": {
        const inList = safeTables.map(t => `'${t}'`).join(", ");
        const sql = `
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name IN (${inList})
          ORDER BY table_name, ordinal_position`;
        return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
      }
      case "mysql": {
        const inList = safeTables.map(t => `'${t}'`).join(", ");
        const sql = `
          SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
          FROM information_schema.columns
          WHERE table_schema = DATABASE() AND TABLE_NAME IN (${inList})
          ORDER BY TABLE_NAME, ORDINAL_POSITION`;
        return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
      }
      case "mssql": {
        const q = safeTables.map(t => {
          if (t.includes(".")) {
            const [schema, name] = t.split(".");
            return { schema: schema.replace(/'/g, "''"), name: name.replace(/'/g, "''") };
          }
          return { schema: null as string | null, name: t.replace(/'/g, "''") };
        });
        const hasSchema = q.some(x => !!x.schema);
        let sql: string;
        if (hasSchema) {
          const orConds = q
            .map(x => (x.schema
              ? `(TABLE_SCHEMA = '${x.schema}' AND TABLE_NAME = '${x.name}')`
              : `(TABLE_NAME = '${x.name}')`))
            .join(" OR ");
          sql = `
            SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE ${orConds}
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
        } else {
          const inList = q.map(x => `'${x.name}'`).join(", ");
          sql = `
            SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME IN (${inList})
            ORDER BY TABLE_NAME, ORDINAL_POSITION`;
        }
        return await describeViaQuery<Record<string, any>>(dbX, sql, "table_name", "column_name", "data_type");
      }
      case "oracle": {
        const inList = safeTables.map(t => `'${t.toUpperCase()}'`).join(", ");
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
          const { rows } = await db.query<{ name: string; type: string }>(pragma, []);
          if (!rows?.length) continue;
          const body = rows.map(r => `- ${r.name} \`${r.type}\``).join("\n");
          parts.push(`## ${t}\n\n${body}`);
        }
        return parts.join("\n\n") || "_(no tables)_";
      }
    }
  }

  // ---- Namespaced tools (gated by 'tools' whitelist) ----

  // Peek
  if (tools?.peek !== false) {
    server.registerTool(
      name("sql.peek"),
      {
        title: "Peek into database content",
        description: [
          "Return up to N rows from each base table in the chosen database.",
          "Dialect-aware and read-only. Use this to quickly inspect unknown schemas.",
          "",
          "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
          "Optionally provide 'type' (mysql\npg\nmssql\noracle\nsqlite) to disambiguate.",
        ].join("\n"),
        inputSchema: {
          maxRowsPerTable: z.number().int().min(1).max(10000).default(50),
          as: z.enum(["markdown", "json"]).default("markdown"),
        },
      },
      async ({ maxRowsPerTable, as }) => {
        const tables = await listTables(db);
        const safeTables = Array.from(new Set(tables.filter((t): t is string => typeof t === "string" && t.length > 0)));
        if (!safeTables.length) {
          return { content: [{ type: "text", text: as === "json" ? "[]" : "_(no tables)_" }] };
        }
        const dump = await dumpTables(db, safeTables, maxRowsPerTable);
        if (as === "json") {
          return { content: [{ type: "text", text: JSON.stringify(dump, null, 2) }] };
        }
        const md = dump.map(({ table, rows }) => `## ${table}\n\n${toMarkdown(rows)}`).join("\n\n");
        return { content: [{ type: "text", text: md }] };
      }
    );
  }

  // Schema
  if (tools?.schema !== false) {
    server.registerTool(
      name("sql.schema"),
      {
        title: "Describe schema",
        description: [
          "Return a compact Markdown outline of tables and columns for the chosen database.",
          "If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime.",
          "Optionally provide 'type' to disambiguate.",
        ].join("\n"),
        inputSchema: {},
      },
      async () => {
        const md = await describeSchema(db);
        return { content: [{ type: "text", text: md }] };
      }
    );
  }

  // Query
  if (tools?.query !== false) {
    server.registerTool(
      name("sql.query"),
      {
        title: "Execute SQL",
        description: ["Execute a parameterized SQL query against the chosen database.", "", "**Usage Tips:**", sqlGuardrails()].join("\n"),
        inputSchema: {
          sql: z.string(),
          params: z.record(z.any()).optional().default({}),
          readOnly: z.boolean().default(true),
          rowLimit: z.number().int().min(1).max(10000).default(1000),
          as: z.enum(["json", "markdown"]).default("json"),
        },
      },
      // async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }) => {
      //   if (readOnly && !/^\s*select\b/i.test(sql)) {
      //     throw new Error("readOnly mode: only SELECT is allowed.");
      //   }
      //   const { text, params: mapped } = mapNamedToDriver(sql, params, db.dialect);
      //   const t0 = Date.now();
      //   const { rows, rowCount } = await db.query(text, mapped);
      //   const ms = Date.now() - t0;
      //   const limited = Array.isArray(rows) && rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
      //   await audit(`[${new Date().toISOString()}] ${db.dialect} rows=${rowCount ?? limited?.length ?? 0} ms=${ms} sql=${sql}`);
      //   if (as === "markdown") {
      //     return { content: [{ type: "text", text: toMarkdown(limited) }] };
      //   }
      //   return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
      // }
      async ({ sql, params = {}, readOnly = true, rowLimit = 1000, as = "json" }) => {
        // 1) readOnly (policy overrides user input)
        const effectiveReadOnly = dataPolicy?.readOnly ?? readOnly;
        if (effectiveReadOnly && !/^\s*select\b/i.test(sql)) {
          throw new Error("readOnly mode: only SELECT is allowed.");
        }

        // 2) table allowlist + 3) row filters
        let effectiveSql = sql;
        let effectiveParams: Record<string, any> = { ...(params || {}) };

        if ((dataPolicy?.tableAllow?.length || dataPolicy?.rowFilters)) {
          const base = detectBaseTable(sql);
          if (base) {
            const bare = base.replace(/^[`"'[]?|[`"'\]]?$/g, "").split(".").pop()!.toLowerCase();

            // table allowlist
            if (dataPolicy?.tableAllow?.length) {
              const ok = dataPolicy.tableAllow.map(t => t.toLowerCase()).includes(bare);
              if (!ok) throw new Error(`Forbidden: table '${bare}' not allowed for this role.`);
            }

            // row filters
            const filter = dataPolicy?.rowFilters?.[bare];
            if (filter) {
              if (/:\s*user_id\b/.test(filter) && !userContext?.user_id) {
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
        if (as === "markdown") return { content: [{ type: "text", text: toMarkdown(limited) }] };
        return { content: [{ type: "text", text: JSON.stringify(limited, null, 2) }] };
      }

    );
  }

  function detectBaseTable(sql: string): string | null {
    const m = sql.replace(/\s+/g, " ").match(/\bfrom\s+([A-Za-z0-9_."`]+)\b/i);
    return m?.[1] ?? null;
  }
  function addWhere(sql: string, filter: string): string {
    const idxOrder = sql.search(/\border\s+by\b/i);
    const idxLimit = sql.search(/\blimit\b/i);
    const idxOffset = sql.search(/\boffset\b/i);
    const idxFetch = sql.search(/\bfetch\b/i);
    const cut = [idxOrder, idxLimit, idxOffset, idxFetch].filter(i => i >= 0).sort((a,b)=>a-b)[0] ?? sql.length;
    const head = sql.slice(0, cut);
    const tail = sql.slice(cut);
    if (/\bwhere\b/i.test(head)) return head + " AND (" + filter + ") " + tail;
    return head + " WHERE " + filter + " " + tail;
  }
}


