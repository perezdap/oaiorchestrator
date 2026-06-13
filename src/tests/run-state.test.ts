import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { RunState, generateRunId } from "../orchestrator/RunState.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";

const minimalWorkflow = validateWorkflow({
  name: "test-workflow",
  agents: {
    planner: { type: "planner", model: "auto", instructions: "Plan" },
  },
  phases: [
    { id: "plan", agent: "planner", objective: "Create plan" },
    { id: "implement", agent: "planner", objective: "Implement", dependsOn: ["plan"] },
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
  const dir = mkdtempSync(join(tmpdir(), "runstate-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("generateRunId", () => {
  it("returns non-empty unique IDs", () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1.length).toBeGreaterThan(0);
    expect(id2.length).toBeGreaterThan(0);
    expect(id1).not.toBe(id2);
  });
});

describe("RunState", () => {
  it("creates run directory layout on createNew", () => {
    const cwd = createTempCwd();
    const runId = generateRunId();
    const state = RunState.createNew(runId, minimalWorkflow, cwd, { task: "Test task" });

    expect(existsSync(join(state.runDir, "state.json"))).toBe(true);
    expect(existsSync(join(state.runDir, "artifacts"))).toBe(true);
    expect(existsSync(join(state.runDir, "agent-messages"))).toBe(true);
    expect(existsSync(join(state.runDir, "workflow.yaml"))).toBe(true);
    expect(existsSync(join(state.runDir, "request.md"))).toBe(true);
  });

  it("rejects run ids that would traverse outside .runs", () => {
    const cwd = createTempCwd();
    for (const badId of ["..\\..\\target", "../escape", "a/b", "with space"]) {
      expect(() => RunState.createNew(badId, minimalWorkflow, cwd, { task: "x" })).toThrow(
        /Invalid run id/,
      );
      expect(() => RunState.findRunDir(cwd, badId)).toThrow(/Invalid run id/);
    }
  });

  it("round-trips data through save and load", () => {
    const cwd = createTempCwd();
    const runId = generateRunId();
    const created = RunState.createNew(runId, minimalWorkflow, cwd, { task: "Persist test" });

    created.setStatus("running");
    created.setCurrentPhase("plan");
    created.save();

    const loaded = RunState.load(created.runDir);
    expect(loaded.runId).toBe(runId);
    expect(loaded.status).toBe("running");
    expect(loaded.toJSON().currentPhaseId).toBe("plan");
  });

  it("updates and persists phase status", () => {
    const cwd = createTempCwd();
    const runId = generateRunId();
    const state = RunState.createNew(runId, minimalWorkflow, cwd, { task: "Phase test" });

    expect(state.getPhaseRecord("plan").status).toBe("pending");

    state.updatePhase("plan", { status: "running", startedAt: new Date().toISOString() });
    expect(state.getPhaseRecord("plan").status).toBe("running");

    state.updatePhase("plan", { status: "completed", completedAt: new Date().toISOString() });
    expect(state.getPhaseRecord("plan").status).toBe("completed");

    const reloaded = RunState.load(state.runDir);
    expect(reloaded.getPhaseRecord("plan").status).toBe("completed");
  });

  it("increments acceptance attempt counter", () => {
    const cwd = createTempCwd();
    const runId = generateRunId();
    const state = RunState.createNew(runId, minimalWorkflow, cwd, { task: "Acceptance test" });

    expect(state.toJSON().acceptanceAttempt).toBe(0);
    expect(state.incrementAcceptanceAttempt()).toBe(1);
    expect(state.incrementAcceptanceAttempt()).toBe(2);

    const reloaded = RunState.load(state.runDir);
    expect(reloaded.toJSON().acceptanceAttempt).toBe(2);
  });
});
