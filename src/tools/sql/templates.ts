export function sqlGuardrails(): string {
  return [
    "1. Use a single SELECT statement.",
    "2. Always use :name placeholders (e.g., :from, :limit).",
    "3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed.",
    "4. Use exact table/column names (call `sql.schema` first if unsure).",
    "5. Add LIMIT/TOP/ROWNUM to keep results small.",
    "6. Prefer ANSI SQL over vendor-specific syntax.",
  ].join("\n");
}
