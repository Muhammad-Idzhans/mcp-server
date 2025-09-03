// src/tools/index.ts
import { runNamedQuery } from "./sql/index.js";

/**
 * Export all tool descriptors. The server (stdio.ts) will register them
 * using server.registerTool(...).
 */
export const tools = [runNamedQuery];
