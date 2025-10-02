// src/policy/index.ts
// import fs from "node:fs";
// import * as yaml from "js-yaml";

// export type PolicyFile = {
//   roleBindings?: Record<string, { allow?: { aliases?: string[] } }>;
// };

// let cached: { mtimeMs: number; path: string; policy: PolicyFile } | null = null;

// function loadYaml(path: string): PolicyFile {
//   const stat = fs.statSync(path);
//   if (cached && cached.path === path && cached.mtimeMs === stat.mtimeMs) {
//     return cached.policy;
//   }
//   const raw = fs.readFileSync(path, "utf8");
//   const obj = yaml.load(raw) as PolicyFile;
//   cached = { mtimeMs: stat.mtimeMs, path, policy: obj };
//   return obj;
// }

// export type EvalInput = {
//   roles: string[];      // e.g., ['librarian'] or ['cinemaAdmin', 'admin']
//   allAliases: string[]; // Array.from(registry.keys())
// };
// export type EvalOutput = {
//   allowedAliases: string[];
// };

// export function evaluatePolicyFromFile(path: string, input: EvalInput): EvalOutput {
//   const doc = loadYaml(path);
//   const rb = doc.roleBindings ?? {};
//   const out = new Set<string>();

//   for (const role of input.roles) {
//     const allow = rb[role]?.allow?.aliases ?? [];
//     if (allow.includes("*")) {
//       input.allAliases.forEach(a => out.add(a));
//       continue;
//     }
//     allow.forEach(a => out.add(a));
//   }

//   // Only keep aliases that exist on this server
//   const allowed = [...out].filter(a => input.allAliases.includes(a)).sort();
//   return { allowedAliases: allowed };
// }



// // Added to ensure that specific tools can be accessed by specific role
// // --- Tool-level policy (optional) ---

// export type ToolsAllowed = { schema: boolean; peek: boolean; query: boolean };

// export function evaluateToolsPolicyFromFile(
//   path: string,
//   input: { roles: string[]; aliases: string[] }
// ): Record<string, ToolsAllowed> {
//   // reuse the same loader/cacher
//   const doc: any = (function load() {
//     const fs = require("node:fs");
//     const yaml = require("js-yaml");
//     const raw = fs.readFileSync(path, "utf8");
//     return yaml.load(raw) || {};
//   })();

//   const tp = doc.toolPolicies ?? {};
//   const out: Record<string, ToolsAllowed> = {};

//   for (const alias of input.aliases) {
//     const spec = tp[alias];
//     if (!spec) continue;

//     // start: default is "all tools allowed"
//     let allowed: ToolsAllowed = { schema: true, peek: true, query: true };

//     // apply default.tools if present
//     const d = spec.default?.tools as string[] | undefined;
//     if (Array.isArray(d)) {
//       allowed = {
//         schema: d.includes("sql.schema"),
//         peek: d.includes("sql.peek"),
//         query: d.includes("sql.query"),
//       };
//     }

//     // apply byRole overrides (first match wins, but order of roles is caller-defined)
//     const br = spec.byRole ?? {};
//     for (const r of input.roles) {
//       const t = br[r]?.tools as string[] | undefined;
//       if (Array.isArray(t)) {
//         allowed = {
//           schema: t.includes("sql.schema"),
//           peek: t.includes("sql.peek"),
//           query: t.includes("sql.query"),
//         };
//         // keep going; last matching role wins (you can change this if you prefer first)
//       }
//     }

//     out[alias] = allowed;
//   }

//   return out;
// }


















// src/policy/index.ts
import fs from "node:fs";
import * as yaml from "js-yaml";

export type PolicyFile = {
  roleBindings?: Record<string, { allow?: { aliases?: string[] } }>;
};

let cached: { mtimeMs: number; path: string; policy: PolicyFile } | null = null;

function loadYaml(path: string): PolicyFile {
  const stat = fs.statSync(path);
  if (cached && cached.path === path && cached.mtimeMs === stat.mtimeMs) {
    return cached.policy;
  }
  const raw = fs.readFileSync(path, "utf8");
  const obj = yaml.load(raw) as PolicyFile;
  cached = { mtimeMs: stat.mtimeMs, path, policy: obj };
  return obj;
}

export type EvalInput = {
  roles: string[];       // e.g., ['customer'] or ['merchant_admin']
  allAliases: string[];  // Array.from(registry.keys())
};

export type EvalOutput = {
  allowedAliases: string[];
};

export function evaluatePolicyFromFile(path: string, input: EvalInput): EvalOutput {
  const doc = loadYaml(path);
  const rb = doc.roleBindings ?? {};
  const out = new Set<string>();

  for (const role of input.roles) {
    const allow = rb[role]?.allow?.aliases ?? [];
    if (allow.includes("*")) {
      input.allAliases.forEach(a => out.add(a));
      continue;
    }
    allow.forEach(a => out.add(a));
  }

  // Only keep aliases that exist on this server
  const allowed = [...out].filter(a => input.allAliases.includes(a)).sort();
  return { allowedAliases: allowed };
}

// -----------------------------------------------------------------------------
// Optional: tool-level policy resolution (used by http.ts when present)
// -----------------------------------------------------------------------------
// src/policy/index.ts
export type ToolsAllowed = { schema: boolean; peek: boolean; query: boolean };
export type ToolsPolicyResult = {
  tools: ToolsAllowed;
  readOnly?: boolean;
  tableAllow?: string[];
  rowFilters?: Record<string, string>;
};

export function evaluateToolsPolicyFromFile(
  path: string,
  input: { roles: string[]; aliases: string[] }
): Record<string, ToolsPolicyResult> {
  const doc: any = loadYaml(path) || {};
  const tp = doc.toolPolicies ?? {};
  const out: Record<string, ToolsPolicyResult> = {};

  for (const alias of input.aliases) {
    const spec = tp[alias];
    if (!spec) continue;

    // Start from default (if present)
    const dList = Array.isArray(spec.default?.tools) ? (spec.default.tools as string[]) : undefined;
    let result: ToolsPolicyResult = {
      tools: dList
        ? { schema: dList.includes("sql.schema"), peek: dList.includes("sql.peek"), query: dList.includes("sql.query") }
        : { schema: true, peek: true, query: true },
      readOnly:   spec.default?.readOnly,
      tableAllow: spec.default?.tableAllow,
      rowFilters: spec.default?.rowFilters,
    };

    // Apply byRole overrides (last matching role wins)
    const byRole = spec.byRole ?? {};
    for (const r of input.roles) {
      const rs = byRole[r];
      if (!rs) continue;
      if (Array.isArray(rs.tools)) {
        result.tools = {
          schema: rs.tools.includes("sql.schema"),
          peek:   rs.tools.includes("sql.peek"),
          query:  rs.tools.includes("sql.query"),
        };
      }
      if (typeof rs.readOnly === "boolean") result.readOnly = rs.readOnly;
      if (Array.isArray(rs.tableAllow))     result.tableAllow = rs.tableAllow;
      if (rs.rowFilters && typeof rs.rowFilters === "object") result.rowFilters = rs.rowFilters;
    }

    out[alias] = result;
  }

  return out;
}