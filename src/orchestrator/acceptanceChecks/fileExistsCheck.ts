import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFileAccess } from "../../policies/filePolicy.js";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const fileExistsCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "file_exists" }>
> = {
  type: "file_exists",
  run(check, ctx, base) {
    const fullPath = resolve(ctx.cwd, check.path);
    const policy = evaluateFileAccess(fullPath, ctx.cwd, "read");
    if (policy.verdict === "block") {
      return { ...base, passed: false, message: policy.reason };
    }
    const exists = existsSync(fullPath);
    return {
      ...base,
      passed: exists,
      message: exists ? `File exists: ${check.path}` : `File not found: ${check.path}`,
    };
  },
};
