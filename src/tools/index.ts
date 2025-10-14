import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../db/provider.js";
import type { DbAliasMeta } from "../db/registry.js";

// Import individual tool registrars - add new tools here
import { registerSqlTools } from "./sql/index.js";

export function registerAllTools(
  server: McpServer,
  options: { db: DB; auditPath?: string, ns?: string, meta: Map<string, any>, registry: Map<string, DB> }
) {
  registerSqlTools(server, options);
}
