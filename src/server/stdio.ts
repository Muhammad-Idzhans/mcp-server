import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { tools } from "../tools/index.js";

async function main() {
  const server = new McpServer({
    name: "sql-mcp",
    version: "0.1.0",
  });

  // Register our tools with Zod schemas
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.config.title,
        description: t.config.description,
        inputSchema: t.config.inputSchema as Record<string, z.ZodTypeAny>
      },
      t.handler as any
    );
  }

  // stdio transport: MCP messages via stdin/stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // IMPORTANT for stdio servers: log to stderr, never stdout
  console.error("Server error:", err);
  process.exit(1);
});
