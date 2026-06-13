import type { MockAgentResponse } from "../../runners/mockRunner.js";
import { MockAgentRunner } from "../../runners/mockRunner.js";

export interface PhaseMockConfig {
  id: string;
  result?: string;
  success?: boolean;
  artifacts?: Record<string, string>;
}

const defaultIntakeArtifacts: Record<string, string> = {
  "plan.md": "# Plan\n\nTest plan for mock workflow.",
  "acceptance.md": "# Acceptance\n\n- Tests pass",
};

export function configureMockRunnerForPhases(
  mockRunner: MockAgentRunner,
  phases: PhaseMockConfig[],
): void {
  for (const phase of phases) {
    const response: MockAgentResponse = {
      phaseId: phase.id,
      result: phase.result ?? `Completed ${phase.id}`,
      success: phase.success ?? true,
      artifacts: phase.artifacts,
    };
    mockRunner.setResponse(phase.id, response);
  }
}

export function configureMockRunnerForWorkflowPhases(
  mockRunner: MockAgentRunner,
  phaseIds: string[],
  intakePhaseId = "intake",
): void {
  configureMockRunnerForPhases(
    mockRunner,
    phaseIds.map((id) => ({
      id,
      artifacts: id === intakePhaseId ? { ...defaultIntakeArtifacts } : undefined,
    })),
  );
}
