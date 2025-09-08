// Function to get the appropriate database provider based on environment variable
import type { DB } from "./provider.js";

export async function getDb(): Promise<DB> {
  const provider = (process.env.DB_PROVIDER ?? "sqlite").toLowerCase();

  if (provider === "pg" || provider === "postgres" || provider === "postgresql") {
    return (await import("./providers/postgres.js")).pgDb;
  }
  if (provider === "mysql" || provider === "mariadb") {
    return (await import("./providers/mysql.js")).mysqlDb;
  }
  if (provider === "mssql" || provider === "sqlserver") {
    return (await import("./providers/mssql.js")).mssqlDb;
  }
  if (provider === "oracle") {
    return (await import("./providers/oracle.js")).oracleDb;
  }

  return (await import("./providers/sqlite.js")).sqliteDb; // default for dev
}
