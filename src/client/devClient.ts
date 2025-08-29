import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Minimal dev client that:
 *  - spawns the stdio server
 *  - lists tools
 *  - calls run_named_query
 *  - parses the response with CallToolResultSchema (typed)
 */
async function run() {
  // Spawn our server via tsx (no build needed in dev)
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "tsx", "src/server/stdio.ts"],
  });

  const client = new Client(
    { name: "dev-client", version: "0.1.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    // 1) List tools
    const list = await client.listTools();
    console.log("Tools:", list.tools.map((t) => t.name));

    // 2) Call our SQL tool
    // Option A: use the generic "request" API + schema (fully typed)
    const raw = await client.request(
      {
        method: "tools/call",
        params: {
          name: "run_named_query",
          arguments: {
            query_id: "orders_by_customer",
            params: { customer_id: 1, limit: 5 },
          },
        },
      },
      CallToolResultSchema
    );

    // raw is now CallToolResult (typed)
    const result: CallToolResult = raw;

    // Safely extract the "text" content part
    const textPart = result.content.find(
      (c): c is { type: "text"; text: string } => c.type === "text"
    );

    console.log(
      "Result:\n",
      textPart?.text ?? JSON.stringify(result, null, 2)
    );
  } finally {
    await client.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
