// src/server/stdio.ts
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSqlTools } from "../tools/sql/index.js";
import { loadDbRegistryFromYaml } from "../db/registry.js";

async function main() {
  const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });

  const auditPath = process.env.SQL_AUDIT_LOG;
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";
  const exposeUnscoped = process.env.EXPOSE_UNSCOPED_SQL === "1";

  // Build all pools and collect DBs
  const { registry, closeAll } = await loadDbRegistryFromYaml(cfgPath);
  const aliases = Array.from(registry.keys());

  if (aliases.length === 0) {
    console.warn("[mcp-sql] No healthy DB aliases found. No SQL tools will be registered.");
  } else {
    console.log(`[mcp-sql] Healthy DB aliases: ${aliases.join(", ")}`);
  }

  // Register SQL tools per alias (namespaced tools, e.g., "<alias>.sql.query")
  for (const [alias, db] of registry.entries()) {
    registerSqlTools(server, { db, auditPath, ns: alias });
  }

  // Optional: if exactly one DB alias exists, register a second, un-namespaced copy for dev convenience.
  // This allows calling "sql.schema", "sql.peek", "sql.query" without prefix in your existing devClient.ts.
  if (exposeUnscoped && aliases.length === 1) {
    const onlyAlias = aliases[0];
    const onlyDb = registry.get(onlyAlias)!;
    registerSqlTools(server, { db: onlyDb, auditPath /* no ns => unscoped names */ });
    console.log(
      `[mcp-sql] EXPOSE_UNSCOPED_SQL=1 -> Also registered un-namespaced SQL tools: sql.schema / sql.peek / sql.query`
    );
  }

  // Connect via STDIO transport (MCP stdio)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown (close all DB pools)
  process.on("SIGINT", async () => {
    await closeAll();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await closeAll();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[mcp-sql] fatal:", err);
  process.exit(1);
});
