import { resolve } from "node:path";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

function parseTestOutput(
  parser: "pester" | "vitest" | "jest" | "generic",
  output: string,
  exitCode: number,
): boolean {
  switch (parser) {
    case "pester":
      return exitCode === 0 && /Tests Passed:\s*\d+/i.test(output);
    case "vitest":
      return exitCode === 0 && (/Tests\s+\d+\s+passed/i.test(output) || /✓/.test(output));
    case "jest":
      return exitCode === 0 && /Tests:\s+.*passed/i.test(output);
    case "generic":
      return exitCode === 0;
    default: {
      const _exhaustive: never = parser;
      return exitCode === 0 && Boolean(_exhaustive);
    }
  }
}

export const testResultCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "test_result" }>
> = {
  type: "test_result",
  async run(check, ctx, base) {
    const result = await ctx.shellRunner.run({
      command: check.command,
      cwd: check.cwd ? resolve(ctx.cwd, check.cwd) : ctx.cwd,
    });

    const passed = parseTestOutput(check.parser, result.stdout + result.stderr, result.exitCode);
    return {
      ...base,
      passed,
      message: passed ? "Tests passed" : "Tests failed",
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  },
};
