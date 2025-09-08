import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../db/provider.js";
import { registerSqlTools } from "./sql/index.js";

export function registerAllTools(
  server: McpServer,
  options: { db: DB; auditPath?: string }
) {
  registerSqlTools(server, options);
}
