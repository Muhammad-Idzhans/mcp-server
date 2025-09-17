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

  // === tools/list ===
  const toolsResp = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema
  );
  const toolNames = toolsResp.tools.map(t => t.name);
  console.log("Available tools:", toolNames);

  // --- NEW: auto-detect alias (optionally honoring DEV_DB_ALIAS)
  const preferred = process.env.DEV_DB_ALIAS?.trim();
  const alias = pickAlias(toolNames, preferred);
  if (!alias) {
    throw new Error(
      "No namespaced SQL tools found (expected '<alias>.sql.schema'). " +
      "Check your dbs.yaml and environment."
    );
  }
  console.log("Using DB alias:", alias, preferred ? `(preferred=${preferred})` : "");

  // === tools/call: <alias>.sql.schema ===
  const schemaRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: `${alias}.sql.schema`,
        arguments: {},
      },
    },
    CallToolResultSchema
  );
  console.log(
    "\n=== sql.schema ===\n",
    schemaRes.content?.[0]?.type === "text" ? schemaRes.content[0].text : schemaRes
  );

  // === tools/call: <alias>.sql.peek ===
  const peekRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: `${alias}.sql.peek`,
        arguments: {
          maxRowsPerTable: 50,   // adjust if needed
          as: "json",
        },
      },
    },
    CallToolResultSchema
  );
  console.log(
    "\n=== sql.peek ===\n",
    peekRes.content?.[0]?.type === "text" ? peekRes.content[0].text : JSON.stringify(peekRes, null, 2)
  );

  // === tools/call: <alias>.sql.query ===
  const sample = detectSampleQuery();
  const queryRes = await client.request(
    {
      method: "tools/call",
      params: {
        name: `${alias}.sql.query`,
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

// --- NEW: helper to pick a valid alias from tools/list (with optional preferred)
function pickAlias(names: string[], preferred?: string | null): string | null {
  const aliases = Array.from(new Set(names.map(n => n.split(".")[0])));
  const hasSchema = (a: string) => names.includes(`${a}.sql.schema`);

  if (preferred && aliases.includes(preferred) && hasSchema(preferred)) {
    return preferred;
  }
  const first = aliases.find(hasSchema) ?? null;
  if (!first) {
    console.warn("No alias exposes '.sql.schema'. Found aliases:", aliases);
  }
  return first;
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
