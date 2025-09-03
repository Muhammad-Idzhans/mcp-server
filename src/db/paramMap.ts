import type { Dialect } from "./provider.js";

/**
 * Converts :named placeholders to the target dialect's style.
 * Keeps a stable order for parameter arrays.
 */
export function mapNamedToDriver(
  sql: string,
  named: Record<string, any>,
  dialect: Dialect
): { text: string; params: any } {

  const matches = [...sql.matchAll(/:(\w+)/g)];
  const names = matches.map(m => m[1]);

  if (dialect === "pg") {
    // PostgreSQL uses $1, $2, ...
    let i = 0;
    const text = sql.replace(/:(\w+)/g, () => `$${++i}`);
    const values = names.map(n => named[n]);
    return { text, params: values };
  }

  if (dialect === "mysql") {
    // MySQL/MariaDB use ?
    const text = sql.replace(/:(\w+)/g, () => `?`);
    const values = names.map(n => named[n]);
    return { text, params: values };
  }

  if (dialect === "mssql") {
    // MS SQL allows named parameters like @name when added with request.input()
    const text = sql.replace(/:(\w+)/g, (_, n) => `@${n}`);
    const values = names.map(n => ({ name: n, value: named[n] }));
    return { text, params: values };
  }

  if (dialect === "oracle") {
    // Oracle supports :name directly and expects named binds as an object
    return { text: sql, params: named };
  }

  // SQLite (better-sqlite3) accepts :name directly
  return { text: sql, params: named };
}
