import { z } from "zod";
import { openDb } from "../../db/sqlite.js";
import { QUERY_TEMPLATES } from "./templates.js";

/**
 * Single MCP tool: run_named_query
 * - input: { query_id: string, params?: Record<string, any> }
 * - output: content -> text(JSON) for simplicity
 */
export const runNamedQuery = {
  name: "run_named_query",
  config: {
    title: "Run allow-listed SQL",
    description: "Execute a parameterized, allow-listed SQL template",
    inputSchema: {
      query_id: z.string().describe("Template key in the allow-list"),
      params: z.record(z.any()).default({}).describe("Named params for the template")
    }
  },
  handler: async (args: { query_id: string; params?: Record<string, any> }) => {
    const { query_id, params = {} } = args;

    const sql = QUERY_TEMPLATES[query_id];
    if (!sql) {
      return {
        content: [{ type: "text" as const, text: `Unknown query_id: ${query_id}` }]
      };
    }

    // Enforce safe limit
    const limit = Math.min(Number(params.limit ?? 50), 200);
    const bound = { ...params, limit };

    const db = openDb();
    try {
      const stmt = db.prepare(sql);
      const rows = stmt.all(bound); // named params :param supported by better-sqlite3
      const payload = {
        query_id,
        row_count: rows.length,
        rows
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Query error: ${err?.message ?? err}` }]
      };
    } finally {
      db.close();
    }
  }
};
