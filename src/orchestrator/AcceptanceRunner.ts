import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import type {
  AcceptanceCheck,
  AcceptanceReport,
  AcceptanceResult,
} from "../schemas/acceptance.schema.js";
import type { AgentConfig } from "../schemas/agent.schema.js";
import type { AgentRunner, ShellRunner } from "../runners/types.js";
import { runCheck } from "./acceptanceChecks/index.js";

export interface AcceptanceRunnerOptions {
  cwd: string;
  runId: string;
  shellRunner: ShellRunner;
  agentRunner?: AgentRunner;
  approvalPolicy?: ApprovalPolicy;
  artifactsDir?: string;
  resolveAgentConfig?: (agentId: string) => AgentConfig | undefined;
}

export class AcceptanceRunner {
  constructor(private readonly options: AcceptanceRunnerOptions) {}

  async runChecks(
    criteria: AcceptanceCheck[],
    attempt: number,
  ): Promise<AcceptanceReport> {
    const results: AcceptanceResult[] = [];

    for (const check of criteria) {
      const start = Date.now();
      const result = await this.runSingleCheck(check);
      results.push({ ...result, durationMs: Date.now() - start });
    }

    const requiredFailed = results.some((r) => r.required && !r.passed);
    const report: AcceptanceReport = {
      runId: this.options.runId,
      timestamp: new Date().toISOString(),
      attempt,
      passed: !requiredFailed,
      results,
    };

    return report;
  }

  private async runSingleCheck(check: AcceptanceCheck): Promise<AcceptanceResult> {
    const base = {
      checkId: check.id,
      type: check.type,
      required: check.required,
      durationMs: 0,
    };

    return runCheck(check, this.options, base);
  }
}
