import { ApprovalPolicy } from "../../policies/approvalPolicy.js";
import { Orchestrator, type OrchestratorOptions } from "../../orchestrator/Orchestrator.js";
import { MockAgentRunner } from "../../runners/mockRunner.js";
import { NodeShellRunner } from "../../runners/shellRunner.js";
import { createTempCwd } from "./tempDirs.js";

export interface TestOrchestratorOptions extends Omit<OrchestratorOptions, "agentRunner"> {
  /** When true, do not inject MockAgentRunner (for SDK integration tests). */
  useLiveRunners?: boolean;
  agentRunner?: MockAgentRunner;
}

export interface TestOrchestratorBundle {
  orchestrator: Orchestrator;
  cwd: string;
  mockRunner: MockAgentRunner;
}

/**
 * Creates an Orchestrator wired for isolated tests: MockAgentRunner by default,
 * permissive shell policy, and auto-approved manual checks.
 */
export function createTestOrchestrator(
  options: TestOrchestratorOptions = {},
): TestOrchestratorBundle {
  const cwd = options.cwd ?? createTempCwd();
  const mockRunner = options.agentRunner ?? new MockAgentRunner();

  const orchestrator = new Orchestrator({
    ...options,
    cwd,
    agentRunner: options.useLiveRunners ? undefined : mockRunner,
    approvalPolicy:
      options.approvalPolicy ??
      new ApprovalPolicy({ autoApproveInTests: true, autoApproveManualChecks: true }),
    shellRunner: options.shellRunner ?? new NodeShellRunner({ enforcePolicy: false }),
  });

  return { orchestrator, cwd, mockRunner };
}
