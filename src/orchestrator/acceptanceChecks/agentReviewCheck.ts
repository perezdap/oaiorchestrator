import { join } from "node:path";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

const VERDICT_INSTRUCTION =
  "End your response with a single line `VERDICT: PASS` if every criterion is satisfied, " +
  "or `VERDICT: FAIL` otherwise. If you are uncertain, answer FAIL.";

/**
 * Decide whether a free-text agent review passed. A chat model has no host-side
 * proof, so this passes ONLY on an explicit, unambiguous final verdict line and
 * fails closed on anything else (missing verdict, caveated verdict, inline
 * mention, or negative text). The model is instructed to emit the verdict.
 */
function evaluateReview(result: string | undefined): boolean {
  if (!result) return false;
  const lines = result.toLowerCase().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lastLine = (lines.at(-1) ?? "").replace(/[.!]+$/, "").trim();
  const finalVerdict = lastLine.match(/^verdict:\s*(pass|fail)$/);
  return finalVerdict ? finalVerdict[1] === "pass" : false;
}

export const agentReviewCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "agent_review" }>
> = {
  type: "agent_review",
  async run(check, ctx, base) {
    if (!ctx.agentRunner) {
      return {
        ...base,
        passed: false,
        message: "Agent runner not configured for agent_review check",
      };
    }

    const artifactsDir =
      ctx.artifactsDir ?? join(ctx.cwd, ".runs", ctx.runId, "artifacts");

    // Honor the named workflow agent's model/baseUrl so reviews hit the
    // configured provider. A named-but-unresolvable agent fails closed rather
    // than silently using the default endpoint.
    const resolved = check.agent ? ctx.resolveAgentConfig?.(check.agent) : undefined;
    if (check.agent && !resolved) {
      return {
        ...base,
        passed: false,
        message: `agent_review references unknown agent: ${check.agent}`,
      };
    }

    const prompt = `${check.prompt}\n\n${VERDICT_INSTRUCTION}`;
    const agentRunInput = {
      agentId: check.agent ?? "verifier",
      agentConfig: {
        type: resolved?.type ?? ("verifier" as const),
        model: resolved?.model ?? "auto",
        baseUrl: resolved?.baseUrl,
        instructions: prompt,
      },
      prompt,
      cwd: ctx.cwd,
      executionMode: "local" as const,
      runId: ctx.runId,
      phaseId: `acceptance-${check.id}`,
      artifactsDir,
    };

    const result = await ctx.agentRunner.run(agentRunInput);
    const passed = result.success && evaluateReview(result.result);

    return {
      ...base,
      passed,
      message: passed ? "Agent review passed" : "Agent review failed",
      output: result.result,
    };
  },
};
