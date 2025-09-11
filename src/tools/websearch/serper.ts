// src/tools/websearch/serper.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers a global MCP tool: `web.search`
 * Backed by Serper (https://serper.dev).
 *
 * Auth:
 *  - Header: X-API-KEY: <SERPER_API_KEY>
 * Endpoint:
 *  - POST https://google.serper.dev/search
 *
 * Notes:
 *  - Supports Google localization parameters (hl, gl) and time filters via tbs ("qdr").
 *  - "qdr" values: h=hour, d=day, w=week, m=month, y=year.
 */

// Minimal normalized result shape
interface ResultItem {
  title?: string;
  url?: string;
  snippet?: string;
  position?: number;
}

export function registerSerperWebSearch(server: McpServer) {
  const INPUT = {
    query: z.string().min(1, "query is required"),
    // Number of results and pagination
    num: z.number().int().min(1).max(50).default(10),
    page: z.number().int().min(1).max(10).default(1),

    // Localization
    hl: z.string().min(2).max(8).optional(), // interface language, e.g., "en", "ms", "en-GB"
    gl: z.string().min(2).max(8).optional(), // country code, e.g., "us", "my"

    // Optional site restriction and freshness range
    site: z.string().optional(), // e.g., "learn.microsoft.com"
    freshness: z.enum(["any", "h", "d", "w", "m", "y"]).default("any"),
    autocorrect: z.boolean().default(true),

    // Output format
    as: z.enum(["json", "markdown"]).default("json"),
  };

  server.registerTool(
    "web.search",
    {
      title: "Web search (Serper)",
      description: [
        "Search the web via Serper (Google Search API).",
        "Supports localization (hl/gl), site filters, and freshness (qdr) limits.",
      ].join("\n"),
      inputSchema: INPUT,
    },
    async (args) => {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error("Missing SERPER_API_KEY in environment.");
      }

      // Build query
      const q = args.site ? `site:${args.site} ${args.query}` : args.query;

      // Map freshness to Google's "qdr" time filter (tbs parameter).
      // h=hour, d=day, w=week, m=month, y=year.
      const tbs =
        args.freshness && args.freshness !== "any" ? `qdr:${args.freshness}` : undefined;

      // Serper search endpoint & payload
      const url = "https://google.serper.dev/search";
      const body = {
        q,
        num: args.num,
        page: args.page, // 1-based page index is supported by Serper clients
        hl: args.hl,
        gl: args.gl,
        autocorrect: args.autocorrect,
        ...(tbs ? { tbs } : {}),
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Serper error: ${res.status} ${res.statusText} ${text}`);
      }

      const json: any = await res.json();

      // Normalize results: we care about organic links; Serper also returns knowledgeGraph, etc.
      const items: ResultItem[] = Array.isArray(json?.organic)
        ? json.organic.map((r: any): ResultItem => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
            position: r.position,
          }))
        : [];

      if (args.as === "markdown") {
        const md =
          items.length === 0
            ? "_(no results)_"
            : items
                .map(
                  (r: ResultItem) =>
                    `- **${escapeMd(r.title ?? "(no title)")}** — ${r.snippet ?? ""}\n  <${r.url}>`
                )
                .join("\n");
        return { content: [{ type: "text", text: md }] };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }],
      };
    }
  );
}

function escapeMd(s: string) {
  return s.replace(/([*_`~])/g, "\\$1");
}
