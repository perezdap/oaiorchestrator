import type { ApprovalPolicy } from "../../policies/approvalPolicy.js";
import type { AcceptanceCheck, AcceptanceResult } from "../../schemas/acceptance.schema.js";
import type { AgentConfig } from "../../schemas/agent.schema.js";
import type { AgentRunner, ShellRunner } from "../../runners/types.js";

export interface AcceptanceCheckContext {
  cwd: string;
  runId: string;
  shellRunner: ShellRunner;
  agentRunner?: AgentRunner;
  approvalPolicy?: ApprovalPolicy;
  artifactsDir?: string;
  /** Resolve a workflow agent's config (model, baseUrl, …) for agent_review checks. */
  resolveAgentConfig?: (agentId: string) => AgentConfig | undefined;
}

export type AcceptanceResultBase = Omit<AcceptanceResult, "passed" | "message" | "output">;

export interface AcceptanceCheckHandler<T extends AcceptanceCheck = AcceptanceCheck> {
  type: T["type"];
  run(
    check: T,
    ctx: AcceptanceCheckContext,
    base: AcceptanceResultBase,
  ): Promise<AcceptanceResult> | AcceptanceResult;
}
