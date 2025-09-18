// src/db/registry.ts
import fs from "node:fs";
import * as yaml from "js-yaml";
import { getDb } from "./index.js";
import type { DB, Dialect } from "./provider.js";

/**
 * NOTE: This version adds:
 *  - ${ENV} and ${ENV:default} expansion for all string fields in dbs.yaml
 *  - "enabled: false" support to skip entries explicitly
 *  - Graceful skip of entries whose required envs are missing/blank
 *  - Light type coercion (e.g., port -> number)
 */

export type DbEntry =
  | ({
      alias: string;
      enabled?: boolean;
      dialect: "mssql";
      host: string; port?: number; user: string; password: string; database: string;
      options?: Record<string, any>;
    })
  | ({
      alias: string;
      enabled?: boolean;
      dialect: "mysql";
      host: string; port?: number; user: string; password: string; database: string;
    })
  | ({
      alias: string;
      enabled?: boolean;
      dialect: "pg";
      host: string; port?: number; user: string; password: string; database: string;
    })
  | ({
      alias: string;
      enabled?: boolean;
      dialect: "oracle";
      connectString: string; user: string; password: string;
    })
  | ({
      alias: string;
      enabled?: boolean;
      dialect: "sqlite";
      file: string;
    });

export interface DbConfigFile {
  databases: DbEntry[];
}

export interface DbAliasMeta {
  alias: string;
  dialect: Dialect;     // "mysql" | "pg" | "mssql" | "oracle" | "sqlite"
  databaseName: string; // what you want to show on /dbs
  host?: string;
  port?: number;
  connectString?: string;
  file?: string;
}

/** ------------------------------------------------------------------ */
/** ENV EXPANSION HELPERS: ${NAME} or ${NAME:default} in YAML strings. */
/** ------------------------------------------------------------------ */

function expandEnvInString(str: string): string {
  // Replace ${VAR} or ${VAR:default}
  return str.replace(/\$\{([A-Z0-9_]+)(?::([^}]*))?\}/gi, (_m, name: string, def?: string) => {
    const v = process.env[name];
    if (v === undefined || v === "") {
      // If no value and default provided -> use default; otherwise keep empty (so we can "skip" later).
      return def ?? "";
    }
    return v;
  });
}

function deepExpand<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj === "string") return expandEnvInString(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(deepExpand) as unknown as T;
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) out[k] = deepExpand(v);
    return out;
  }
  return obj;
}

/** Coerce common field types (e.g., port string -> number). */
function coerceTypesInPlace(entry: any) {
  if (entry?.port != null && typeof entry.port === "string") {
    const n = Number(entry.port);
    if (Number.isFinite(n)) entry.port = n;
  }
  return entry;
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

/** Figure out missing required keys per dialect for a given entry. */
function getMissingKeys(entry: any): string[] {
  switch (entry?.dialect) {
    case "mssql": {
      const req = ["alias", "dialect", "host", "user", "password", "database"];
      return req.filter((k) => !isNonEmptyString(entry[k]));
    }
    case "mysql": {
      const req = ["alias", "dialect", "host", "user", "password", "database"];
      return req.filter((k) => !isNonEmptyString(entry[k]));
    }
    case "pg": {
      const req = ["alias", "dialect", "host", "user", "password", "database"];
      return req.filter((k) => !isNonEmptyString(entry[k]));
    }
    case "oracle": {
      const req = ["alias", "dialect", "connectString", "user", "password"];
      return req.filter((k) => !isNonEmptyString(entry[k]));
    }
    case "sqlite": {
      const req = ["alias", "dialect", "file"];
      return req.filter((k) => !isNonEmptyString(entry[k]));
    }
    default:
      return ["dialect"];
  }
}

/** ---------------------------------------------------------- */
/** Your existing helpers: clear DB env, patch, scoped getDb(). */
/** ---------------------------------------------------------- */

/** Hard-clear DB-related env before each alias to prevent bleed. */
function clearDbEnv(env = process.env) {
  const explicit = [
    "DB_PROVIDER",
    "DB_DIALECT",
    "DATABASE_URL",
    "SQLITE_FILE",
    "SQLITE_PATH",
  ];
  const patterns = [
    /^PG/i,
    /^POSTGRES/i,
    /^MYSQL/i,
    /^MSSQL/i,
    /^SQLSERVER/i,
    /^ORACLE/i,
    /^ORACLE_DB/i,
    /^ORACLEDB/i,
    /^OCI/i,
    /^SQLITE/i,
  ];
  for (const k of explicit) delete env[k];
  for (const k of Object.keys(env)) {
    if (patterns.some((rx) => rx.test(k))) delete env[k];
  }
}

function withEnv<T>(patch: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(patch)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

function envPatchFor(entry: DbEntry): Record<string, string> {
  switch (entry.dialect) {
    case "mssql": {
      const host = entry.host;
      const port = String(entry.port ?? 1433);
      const user = entry.user;
      const password = entry.password;
      const database = entry.database;

      // Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;
      const base =
        [
          `Server=${host},${port}`,
          `Database=${database}`,
          `User Id=${user}`,
          `Password=${password}`,
          `Encrypt=true`,
          `TrustServerCertificate=true`, // OK for dev; for prod consider false with proper certs
        ].join(";") + ";";

      const patch: Record<string, string> = {
        DB_PROVIDER: "mssql",
        DB_DIALECT: "mssql",
        DATABASE_URL: base,
        MSSQL_SERVER: host,
        MSSQL_HOST: host,
        MSSQL_PORT: port,
        MSSQL_USER: user,
        MSSQL_PASSWORD: password,
        MSSQL_DATABASE: database,
      };
      if ((entry as any).options) {
        patch.MSSQL_OPTS_JSON = JSON.stringify((entry as any).options);
      }
      return patch;
    }

    case "mysql": {
      const host = entry.host;
      const port = String(entry.port ?? 3306);
      const user = encodeURIComponent(entry.user);
      const password = encodeURIComponent(entry.password);
      const database = entry.database;

      const url = `mysql://${user}:${password}@${host}:${port}/${database}`;

      return {
        DB_PROVIDER: "mysql",
        DB_DIALECT: "mysql",
        DATABASE_URL: url,
        MYSQL_HOST: host,
        MYSQL_PORT: port,
        MYSQL_USER: decodeURIComponent(user),
        MYSQL_PASSWORD: decodeURIComponent(password),
        MYSQL_DATABASE: database,
      };
    }

    case "pg": {
      const host = entry.host;
      const port = String(entry.port ?? 5432);
      const user = encodeURIComponent(entry.user);
      const password = encodeURIComponent(entry.password);
      const database = entry.database;

      const url = `postgres://${user}:${password}@${host}:${port}/${database}`;

      return {
        DB_PROVIDER: "pg",
        DB_DIALECT: "pg",
        DATABASE_URL: url,
        PGHOST: host,
        PGPORT: port,
        PGUSER: decodeURIComponent(user),
        PGPASSWORD: decodeURIComponent(password),
        PGDATABASE: database,
      };
    }

    case "oracle": {
      const user = entry.user;
      const password = entry.password;
      const connectString = entry.connectString;
      const url = `${user}/${password}@${connectString}`;

      return {
        DB_PROVIDER: "oracle",
        DB_DIALECT: "oracle",
        DATABASE_URL: url,
        ORACLE_CONNECT_STRING: connectString,
        ORACLE_USER: user,
        ORACLE_PASSWORD: password,
      };
    }

    case "sqlite": {
      return {
        DB_PROVIDER: "sqlite",
        DB_DIALECT: "sqlite",
        SQLITE_FILE: entry.file,
        SQLITE_PATH: entry.file,
      };
    }
  }
}

export async function loadDbRegistryFromYaml(path: string): Promise<{
  registry: Map<string, DB>;
  meta: Map<string, DbAliasMeta>;
  closeAll: () => Promise<void>;
}> {
  const raw = fs.readFileSync(path, "utf8");

  // 1) Parse YAML
  const parsed = yaml.load(raw) as DbConfigFile;

  // 2) Expand ${ENV} placeholders across all strings
  const cfg = deepExpand(parsed) as DbConfigFile;

  const list = cfg?.databases ?? [];
  if (!list.length) throw new Error(`No databases in ${path}`);

  const registry = new Map<string, DB>();
  const meta = new Map<string, DbAliasMeta>();

  // small helper – works on Windows and POSIX
  const basename = (p?: string) =>
    (p ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "(sqlite)";

  for (const rawEntry of list) {
    if ((rawEntry as any)?.enabled === false) {
      console.warn(`[db] Skipping '${(rawEntry as any).alias ?? "?"}' (enabled=false).`);
      continue;
    }

    // Coerce obvious scalar types before expansion
    const coerced = coerceTypesInPlace({ ...rawEntry }) as DbEntry;

    // Expand one YAML item into N concrete entries (lists -> variants)
    const variants = expandDbEntry(coerced);

    for (const entry of variants) {
      // Validate this concrete entry
      const missing = getMissingKeys(entry as any);
      if (missing.length > 0) {
        console.warn(
          `[db] Skipping alias='${(entry as any).alias ?? "?"}' (dialect='${(entry as any).dialect ?? "?"}'): ` +
            `missing env/fields: ${missing.join(", ")}`
        );
        continue;
      }

      // ---- Compute displayable database name for this alias (per dialect) ----
      let databaseName = "";
      switch (entry.dialect) {
        case "mysql":
        case "pg":
        case "mssql":
          databaseName = (entry as any).database ?? "";
          break;
        case "oracle": {
          const cs = (entry as any).connectString ?? "";
          // Use everything after the final "/" as the service name, else the raw connect string
          databaseName = cs.includes("/") ? cs.split("/").pop()! : cs;
          break;
        }
        case "sqlite": {
          const f = (entry as any).file ?? (entry as any).path ?? "";
          databaseName = f ? basename(f) : "(sqlite)";
          break;
        }
        default:
          databaseName = (entry as any).database ?? "";
      }
      if (!databaseName) databaseName = "(unknown)";

      // Store meta for this alias
      meta.set(entry.alias, {
        alias: entry.alias,
        dialect: entry.dialect,
        databaseName,
        host: (entry as any).host,
        port: (entry as any).port,
        connectString: (entry as any).connectString,
        file: (entry as any).file ?? (entry as any).path,
      });

      // Build and store DB with isolated env per alias
      clearDbEnv();
      const patch = envPatchFor(entry);
      const db = await withEnv(patch, async () => await getDb());

      if (registry.has(entry.alias)) {
        console.error(`[db] Duplicate alias '${entry.alias}' – previous entry will be overwritten.`);
      }
      registry.set(entry.alias, db);
    }
  }

  if (registry.size === 0) {
    console.warn(`[db] No usable database entries after expansion/validation from ${path}.`);
  }

  async function closeAll() {
    for (const db of registry.values()) {
      await db.close?.();
    }
  }

  return { registry, meta, closeAll };
}

// Utility: split a comma-separated env value into a string[], trim blanks.
function splitList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return String(v)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Expand a single raw DbEntry that may contain comma-separated fields
 * (alias, host, port, user, password, database, connectString)
 * into N concrete entries by zipping/broadcasting those lists.
 */

function expandDbEntry<T extends Record<string, any>>(raw: T): T[] {
  const multiKeys = new Set([
    "alias",
    "host",
    "port",
    "user",
    "password",
    "database",       // <-- make sure "database" is included
    "connectString",
  ]);

  // Collect arrays per multiKey and determine N (max length)
  const arrays: Record<string, string[]> = {};
  let maxLen = 1;

  for (const [k, v] of Object.entries(raw)) {
    if (!multiKeys.has(k)) continue;
    const arr = Array.isArray(v) ? v.map(String) : splitList(v);
    if (arr.length) {
      arrays[k] = arr;
      if (arr.length > maxLen) maxLen = arr.length;
    }
  }

  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    const variant: any = { ...raw };

    for (const key of Object.keys(arrays)) {
      const list = arrays[key];
      // broadcast last item if list is shorter than maxLen
      variant[key] = list[Math.min(i, list.length - 1)];
    }

    // Ensure alias uniqueness
    if (maxLen > 1) {
      const providedAlias = variant.alias ?? raw.dialect ?? "db";
      const aliasWasList = (arrays.alias?.length ?? 0) > 1;
      variant.alias = aliasWasList
        ? providedAlias
        : `${providedAlias}${i === 0 ? "" : `_${i + 1}`}`;
    }

    // Normalize numeric port if present
    if (variant.port !== undefined) {
      const n = Number(variant.port);
      if (!Number.isNaN(n)) variant.port = n;
    }

    out.push(variant);
  }

  return out;
}


