// src/server/stdio.ts
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSqlTools } from "../tools/sql/index.js";
import { loadDbRegistryFromYaml } from "../db/registry.js";
import { registerSerperWebSearch } from "../tools/websearch/serper.js";

async function main() {
  const server = new McpServer({ name: "mcp-sql", version: "0.2.0" });
  const auditPath = process.env.SQL_AUDIT_LOG;
  const cfgPath = process.env.SQL_DBS_CONFIG ?? "./dbs.yaml";

  // Build all pools
  const { registry, closeAll } = await loadDbRegistryFromYaml(cfgPath);

  // Register tools per alias
  for (const [alias, db] of registry.entries()) {
    registerSqlTools(server, { db, auditPath, ns: alias });
  }
  // Register Web Search Tool
  registerSerperWebSearch(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

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
