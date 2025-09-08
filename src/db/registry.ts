// src/db/registry.ts
import fs from "node:fs";
import * as yaml from "js-yaml";
import { getDb } from "./index.js";
import type { DB } from "./provider.js";

export type DbEntry =
  | {
      alias: string;
      dialect: "mssql";
      host: string; port?: number; user: string; password: string; database: string;
      options?: Record<string, any>;
    }
  | {
      alias: string;
      dialect: "mysql";
      host: string; port?: number; user: string; password: string; database: string;
    }
  | {
      alias: string;
      dialect: "pg";
      host: string; port?: number; user: string; password: string; database: string;
    }
  | {
      alias: string;
      dialect: "oracle";
      connectString: string; user: string; password: string;
    }
  | {
      alias: string;
      dialect: "sqlite";
      file: string;
    };

export interface DbConfigFile {
  databases: DbEntry[];
}

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

      // mssql supports connection strings like this:
      // Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;
      const base = [
        `Server=${host},${port}`,
        `Database=${database}`,
        `User Id=${user}`,
        `Password=${password}`,
        `Encrypt=true`,
        `TrustServerCertificate=true`, // safe for local/dev & containers
      ].join(";") + ";";

      const patch: Record<string, string> = {
        DB_PROVIDER: "mssql",
        DB_DIALECT: "mssql",
        DATABASE_URL: base,
        // Also provide vendor vars (some providers/helpers may read these)
        MSSQL_SERVER: host,
        MSSQL_HOST: host,
        MSSQL_PORT: port,
        MSSQL_USER: user,
        MSSQL_PASSWORD: password,
        MSSQL_DATABASE: database,
      };
      if (entry.options) {
        patch.MSSQL_OPTS_JSON = JSON.stringify(entry.options);
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
      // EZCONNECT: user/password@host:port/service
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
      // Align both names so all helpers/providers work
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
  closeAll: () => Promise<void>;
}> {
  const raw = fs.readFileSync(path, "utf8");
  const cfg = yaml.load(raw) as DbConfigFile;
  if (!cfg?.databases?.length) throw new Error(`No databases in ${path}`);
  const registry = new Map<string, DB>();
  for (const entry of cfg.databases) {
    // 1) Clear DB env fully
    clearDbEnv();
    // 2) Apply alias env and build a DB bound to those envs
    const patch = envPatchFor(entry);
    const db = await withEnv(patch, async () => await getDb());
    // 3) Store db under alias
    registry.set(entry.alias, db);
  }
  async function closeAll() {
    for (const db of registry.values()) {
      await db.close?.();
    }
  }
  return { registry, closeAll };
}
