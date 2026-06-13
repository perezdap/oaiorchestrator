import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";
import { prepareRunForResume } from "../orchestrator/RunRecovery.js";
import { RunState } from "../orchestrator/RunState.js";
import { MockAgentRunner } from "../runners/mockRunner.js";
import { NodeShellRunner } from "../runners/shellRunner.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";

const resumeWorkflow = validateWorkflow({
  name: "resume-workflow",
  agents: {
    planner: { type: "planner", model: "auto", instructions: "Plan" },
    implementer: { type: "implementer", model: "auto", instructions: "Implement" },
    verifier: { type: "verifier", model: "auto", instructions: "Verify" },
  },
  phases: [
    { id: "plan", agent: "planner", objective: "Plan" },
    { id: "implement", agent: "implementer", objective: "Implement", dependsOn: ["plan"] },
    { id: "verify", agent: "verifier", objective: "Verify", dependsOn: ["implement"] },
  ],
});

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "run-recovery-test-"));
  tempDirs.push(dir);
  return dir;
}

function configureMockRunner(mockRunner: MockAgentRunner): void {
  for (const phase of resumeWorkflow.phases) {
    mockRunner.setResponse(phase.id, {
      phaseId: phase.id,
      result: `Completed ${phase.id}`,
      success: true,
    });
  }
}

describe("RunRecovery", () => {
  it("prepareRunForResume resets interrupted phases to pending", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew("crash-run", resumeWorkflow, cwd, { task: "Crash test" });

    state.updatePhase("plan", {
      status: "completed",
      attempts: 1,
      completedAt: new Date().toISOString(),
    });
    state.updatePhase("implement", {
      status: "running",
      attempts: 1,
      startedAt: new Date().toISOString(),
    });
    state.setCurrentPhase("implement");
    state.setStatus("running");
    state.save();

    const summary = prepareRunForResume(state);

    expect(summary.priorRunStatus).toBe("running");
    expect(summary.interruptedPhases).toEqual(["implement"]);
    expect(summary.resetPhaseIds).toEqual(["implement"]);
    expect(summary.resumablePhaseIds).toEqual(["implement", "verify"]);
    expect(state.getPhaseRecord("implement").status).toBe("pending");
    expect(state.toJSON().currentPhaseId).toBeUndefined();
  });

  it("resumes after simulated crash and completes remaining phases", async () => {
    const cwd = createTempCwd();
    const runId = "resume-crash-run";
    const state = RunState.createNew(runId, resumeWorkflow, cwd, { task: "Resume crash test" });

    state.updatePhase("plan", {
      status: "completed",
      attempts: 1,
      completedAt: new Date().toISOString(),
    });
    state.updatePhase("implement", {
      status: "running",
      attempts: 1,
      startedAt: new Date().toISOString(),
    });
    state.setCurrentPhase("implement");
    state.setStatus("running");
    state.save();

    const mockRunner = new MockAgentRunner();
    configureMockRunner(mockRunner);

    const orchestrator = new Orchestrator({
      cwd,
      agentRunner: mockRunner,
      approvalPolicy: new ApprovalPolicy({ autoApproveInTests: true }),
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
    });

    const result = await orchestrator.run({
      workflow: resumeWorkflow,
      inputs: { task: "Resume crash test", repoPath: cwd },
      runId,
      resume: true,
    });

    expect(result.status).toBe("completed");
    expect(result.phasesCompleted).toBe(3);

    const reloaded = RunState.load(result.runDir);
    expect(reloaded.getPhaseRecord("plan").status).toBe("completed");
    expect(reloaded.getPhaseRecord("implement").status).toBe("completed");
    expect(reloaded.getPhaseRecord("verify").status).toBe("completed");

    const phaseLog = readFileSync(join(result.runDir, "phase-log.md"), "utf-8");
    expect(phaseLog).toContain("Resuming after interruption");
    expect(phaseLog).toContain("implement");
  });

  it("logs partial progress and structured failure when a phase fails", async () => {
    const cwd = createTempCwd();
    const mockRunner = new MockAgentRunner();
    configureMockRunner(mockRunner);
    mockRunner.setResponse("implement", {
      phaseId: "implement",
      result: "Failed implement",
      success: false,
    });

    const orchestrator = new Orchestrator({
      cwd,
      agentRunner: mockRunner,
      approvalPolicy: new ApprovalPolicy({ autoApproveInTests: true }),
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
    });

    const result = await orchestrator.run({
      workflow: resumeWorkflow,
      inputs: { task: "Failure test", repoPath: cwd },
    });

    expect(result.status).toBe("failed");
    expect(result.phasesCompleted).toBe(1);
    expect(result.failure?.scope).toBe("phase");
    expect(result.failure?.kind).toBe("agent_execution");
    expect(result.failure?.phaseId).toBe("implement");

    expect(existsSync(join(result.runDir, "final-report.md"))).toBe(true);
    const finalReport = readFileSync(join(result.runDir, "final-report.md"), "utf-8");
    expect(finalReport).toContain("## Partial progress");
    expect(finalReport).toContain("## Failure");
    expect(finalReport).toContain("[phase/agent_execution]");

    const phaseLog = readFileSync(join(result.runDir, "phase-log.md"), "utf-8");
    expect(phaseLog).toContain("Workflow aborted");
    expect(phaseLog).toContain("plan: completed");
    expect(phaseLog).toContain("implement: failed");
  });
});
