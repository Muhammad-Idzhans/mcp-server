import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function main() {
  // Spawn the server via tsx for dev convenience
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["tsx", "src/server/stdio.ts"],
  });

  const client = new Client({ name: "dev-client", version: "0.1.0" });
  await client.connect(transport);

  // === tools/list (must pass result schema) ===
  const tools = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema
  );
  console.log("Available tools:", tools.tools.map(t => t.name));

  // === tools/call: sql.schema ===
  const schemaRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: "sql.schema",
        arguments: {},
      },
    },
    CallToolResultSchema
  );
  // CallToolResultSchema returns the result directly, not { result: ... }
  console.log(
    "\n=== sql.schema ===\n",
    schemaRes.content?.[0]?.type === "text" ? schemaRes.content[0].text : schemaRes
  );

  // === tools/call: sql.peek ===
  const peekRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: "sql.peek",
        arguments: {
          maxRowsPerTable: 50,   // change if needed
          as: "json",        // or "json"
        },
      },
    },
    CallToolResultSchema
  );

  console.log(
    "\n=== sql.peek ===\n",
    peekRes.content?.[0]?.type === "text" ? peekRes.content[0].text : JSON.stringify(peekRes, null, 2)
  );

  // === tools/call: sql.query ===
  const sample = detectSampleQuery();

  // Edit thissample query with something real from your DB below here:
  // const sample = {
  //   text: "SELECT id, name FROM users WHERE created_at >= :since LIMIT :n",
  //   params: { since: "2025-01-01", n: 10 }
  // };

  const queryRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: "sql.query",
        arguments: {
          sql: sample.text,
          params: sample.params,
          readOnly: true,
          rowLimit: 10,
          as: "json",
        },
      },
    },
    CallToolResultSchema
  );
  console.log(
    "\n=== sql.query ===\n",
    queryRes.content?.[0]?.type === "text" ? queryRes.content[0].text : queryRes
  );

  await client.close();
}

function detectSampleQuery() {
  const provider = (process.env.DB_PROVIDER ?? "sqlite").toLowerCase();
  if (provider.includes("oracle")) return { text: "SELECT 1 AS one FROM dual", params: {} };
  return { text: "SELECT 1 AS one", params: {} };
}

main().catch((err) => {
  console.error("[dev-client] error:", err);
  process.exit(1);
});
