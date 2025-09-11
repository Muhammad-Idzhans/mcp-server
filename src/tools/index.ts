import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "../db/provider.js";

// Import individual tool registrars
import { registerSqlTools } from "./sql/index.js";
import { registerSerperWebSearch } from "../tools/websearch/serper.js";

export function registerAllTools(
  server: McpServer,
  options: { db: DB; auditPath?: string }
) {
  registerSqlTools(server, options);
  registerSerperWebSearch(server);
}
