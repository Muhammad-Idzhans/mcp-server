/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * src/db/index.ts
 *
 * Minimal, env-driven DB provider selector.
 * - Resolves from DB_PROVIDER or DB_DIALECT (or DATABASE_URL scheme), defaulting to sqlite.
 * - Normalizes synonyms (postgres/postgresql -> pg, mariadb -> mysql, sqlserver -> mssql, sqlite3 -> sqlite).
 * - Prefers factory exports (newDb/createDb/default()) else falls back to singletons (pgDb/mysqlDb/...).
 */

import type { DB } from "./provider.js";

type CanonicalDialect = "pg" | "mysql" | "mssql" | "oracle";

const DIALECT_SYNONYMS: Record<string, CanonicalDialect> = {
  // Postgres
  pg: "pg",
  postgres: "pg",
  postgresql: "pg",
  psql: "pg",

  // MySQL
  mysql: "mysql",
  mariadb: "mysql",
  maria: "mysql",

  // SQL Server
  mssql: "mssql",
  "ms-sql": "mssql",
  sqlserver: "mssql",
  "sql-server": "mssql",

  // Oracle
  oracle: "oracle",
  oracledb: "oracle",
  oci: "oracle",
};

function canonicalizeDialect(input?: string | null): CanonicalDialect | undefined {
  if (!input) return undefined;
  const key = String(input).trim().toLowerCase();
  return DIALECT_SYNONYMS[key];
}

function dialectFromDatabaseUrl(url?: string): CanonicalDialect | undefined {
  if (!url) return undefined;

  try {
    const u = new URL(url);
    const proto = u.protocol.replace(":", "").toLowerCase();
    // Map only to supported dialects via synonyms (pg/mysql/mssql/oracle)
    return DIALECT_SYNONYMS[proto];
  } catch {
    // Non-URL strings (JDBC-ish, etc.) - we no longer guess "sqlite"; return undefined
    return undefined;
  }
}

function resolveDialectFromEnv(env = process.env): CanonicalDialect {
  const fromProvider = canonicalizeDialect(env.DB_PROVIDER);
  if (fromProvider) return fromProvider;

  const fromDialect = canonicalizeDialect(env.DB_DIALECT);
  if (fromDialect) return fromDialect;

  const fromUrl = dialectFromDatabaseUrl(env.DATABASE_URL);
  if (fromUrl) return fromUrl;

  throw new Error(
    "Unable to resolve DB dialect from env. " +
    "Please set DB_PROVIDER/DB_DIALECT/DATABASE_URL for a supported dialect (pg/mysql/mssql/oracle)."
  )
}

/** Attach canonical dialect hint on the db object. */
function annotateDialect<T extends object>(db: T, dialect: CanonicalDialect): T & { dialect: CanonicalDialect } {
  if (!db) return { dialect } as any;
  if ((db as any).dialect !== dialect) {
    try {
      Object.defineProperty(db as any, "dialect", { value: dialect, enumerable: true });
    } catch {
      (db as any).dialect = dialect;
    }
  }
  return db as any;
}

/** Prefer factory if available, else fall back to well-known singleton names. */
function materializeDb(mod: any, dialect: CanonicalDialect): DB {
  // 1) Factories (preferred)
  if (typeof mod?.newDb === "function") {
    const db = mod.newDb();
    return annotateDialect(db, dialect);
  }
  if (typeof mod?.createDb === "function") {
    const db = mod.createDb();
    return annotateDialect(db, dialect);
  }
  if (typeof mod?.default === "function") {
    const db = mod.default();
    return annotateDialect(db, dialect);
  }

  // 2) default export already a db object?
  if (mod?.default && typeof mod.default === "object" && typeof mod.default.query === "function") {
    return annotateDialect(mod.default, dialect);
  }

  // 3) Well-known singleton names (your current exports)
  const knownSingletons: Record<CanonicalDialect, string[]> = {
    pg: ["pgDb", "db"],
    mysql: ["mysqlDb", "db"],
    mssql: ["mssqlDb", "db"],
    oracle: ["oracleDb", "db"],
  };
  for (const key of knownSingletons[dialect]) {
    const val = mod?.[key];
    if (val && typeof val.query === "function") {
      return annotateDialect(val, dialect);
    }
  }

  // 4) Heuristic: any object with query()
  for (const key of Object.keys(mod ?? {})) {
    const val = mod[key];
    if (val && typeof val === "object" && typeof val.query === "function") {
      return annotateDialect(val, dialect);
    }
  }

  throw new Error(
    `Provider module for '${dialect}' does not expose a usable DB export. ` +
      `Expected a factory (newDb/createDb/default()) or a singleton (e.g., ${dialect}Db). ` +
      `Exports: [${Object.keys(mod ?? {}).join(", ")}]`
  );
}

/** Load the provider module for a given canonical dialect. */
async function loadModule(dialect: CanonicalDialect): Promise<any> {
  switch (dialect) {
    case "pg":
      return import("./providers/postgres.js");
    case "mysql":
      return import("./providers/mysql.js");
    case "mssql":
      return import("./providers/mssql.js");
    case "oracle":
      return import("./providers/oracle.js");
    default:
      // This should be unreachable due to the CanonicalDialect union,
      // but we keep a defensive guard for future edits.
      throw new Error(`Unsupported dialect: ${dialect}`);
  }
}

/**
 * Public API: get a DB instance based on current env.
 * - Imports provider AFTER env resolution.
 * - Uses factory if present; otherwise singleton.
 */
export async function getDb(): Promise<DB> {
  const dialect = resolveDialectFromEnv(process.env);
  const mod = await loadModule(dialect);
  const db = materializeDb(mod, dialect);
  return db as DB;
}

/** Optional helper (e.g., for X-DB-Dialect header). */
export function getResolvedDialect(): CanonicalDialect {
  return resolveDialectFromEnv(process.env);
}
