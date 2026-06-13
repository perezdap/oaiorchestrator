import { resolve } from "node:path";
import { defaultPolicyGate } from "../../policies/PolicyGate.js";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const commandCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "command" }>
> = {
  type: "command",
  async run(check, ctx, base) {
    const blocked = defaultPolicyGate.enforceCommandForAcceptance(check.command);
    if (blocked) {
      return { ...base, ...blocked };
    }

    const result = await ctx.shellRunner.run({
      command: check.command,
      // Resolve a relative cwd against the run's workspace, not the launcher's
      // process directory (which is where node spawn would otherwise resolve it).
      cwd: check.cwd ? resolve(ctx.cwd, check.cwd) : ctx.cwd,
      timeoutMs: check.timeoutMs,
      env: {
        ORCH_RUN_ID: ctx.runId,
        ...(ctx.artifactsDir ? { ORCH_ARTIFACTS_DIR: ctx.artifactsDir } : {}),
      },
    });

    return {
      ...base,
      passed: result.exitCode === 0,
      message:
        result.exitCode === 0
          ? "Command succeeded"
          : `Command failed with exit code ${result.exitCode}`,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  },
};
