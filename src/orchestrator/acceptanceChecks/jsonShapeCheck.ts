import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFileAccess } from "../../policies/filePolicy.js";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

function validateJsonShape(data: unknown, schema: Record<string, unknown>): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  for (const [key, expected] of Object.entries(schema)) {
    if (!(key in obj)) return false;
    if (typeof expected === "string" && typeof obj[key] !== expected) return false;
  }
  return true;
}

export const jsonShapeCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "json_shape" }>
> = {
  type: "json_shape",
  run(check, ctx, base) {
    const fullPath = resolve(ctx.cwd, check.path);
    const policy = evaluateFileAccess(fullPath, ctx.cwd, "read");
    if (policy.verdict !== "allow") {
      return { ...base, passed: false, message: policy.reason };
    }
    if (!existsSync(fullPath)) {
      return { ...base, passed: false, message: `JSON file not found: ${check.path}` };
    }

    try {
      const data = JSON.parse(readFileSync(fullPath, "utf-8")) as unknown;
      const valid = validateJsonShape(data, check.schema);
      return {
        ...base,
        passed: valid,
        message: valid ? "JSON matches expected shape" : "JSON does not match expected shape",
      };
    } catch (err) {
      return {
        ...base,
        passed: false,
        message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
