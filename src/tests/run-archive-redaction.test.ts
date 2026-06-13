import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  phases: [{ id: "plan", agent: "planner", objective: "Create plan" }],
});

const secretToken = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "run-archive-redaction-"));
  tempDirs.push(dir);
  return dir;
}

describe("RunArchive persistence redaction", () => {
  it("redacts secrets in the persisted workflow snapshot", () => {
    const cwd = createTempCwd();
    const workflowWithSecret = validateWorkflow({
      name: "secret-workflow",
      agents: {
        planner: {
          type: "planner",
          model: "auto",
          instructions: `Use the key sk-proj-abcDEF123ghiJKL456mnoPQR789stu when calling the API.`,
        },
      },
      phases: [{ id: "plan", agent: "planner", objective: "Plan" }],
    });
    const state = RunState.createNew(generateRunId(), workflowWithSecret, cwd, { task: "x" });

    const snapshot = readFileSync(join(state.runDir, "workflow.yaml"), "utf-8");
    expect(snapshot).not.toContain("sk-proj-abcDEF123ghiJKL456mnoPQR789stu");
    expect(snapshot).toContain("[REDACTED]");
  });

  it("redacts secrets in phase logs", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, { task: "test" });

    state.appendPhaseLog(`token=${secretToken}`);

    const log = readFileSync(join(state.runDir, "phase-log.md"), "utf-8");
    expect(log).not.toContain(secretToken);
    expect(log).toContain("[REDACTED]");
  });

  it("redacts secrets in agent messages", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, { task: "test" });

    state.saveAgentMessage("plan", `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9`);

    const message = readFileSync(join(state.runDir, "agent-messages", "plan.md"), "utf-8");
    expect(message).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(message).toContain("[REDACTED]");
  });

  it("redacts secrets in acceptance reports", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, { task: "test" });

    state.writeAcceptanceReport({
      runId: state.runId,
      timestamp: new Date().toISOString(),
      attempt: 1,
      passed: false,
      results: [
        {
          checkId: "cmd",
          type: "command",
          passed: false,
          required: true,
          message: `failed with token=${secretToken}`,
          durationMs: 1,
        },
      ],
    });

    const json = readFileSync(join(state.runDir, "acceptance-report.json"), "utf-8");
    const markdown = readFileSync(join(state.runDir, "acceptance-report.md"), "utf-8");
    expect(json).not.toContain(secretToken);
    expect(markdown).not.toContain(secretToken);
    expect(json).toContain("[REDACTED]");
  });

  it("redacts secrets in final reports", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, { task: "test" });

    state.writeFinalReport(`Summary with api_key=${secretToken}`);

    const report = readFileSync(join(state.runDir, "final-report.md"), "utf-8");
    expect(report).not.toContain(secretToken);
    expect(report).toContain("[REDACTED]");
  });

  it("redacts secrets in persisted request inputs", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, {
      task: `Use token=${secretToken}`,
    });

    const request = readFileSync(join(state.runDir, "request.md"), "utf-8");
    expect(request).not.toContain(secretToken);
    expect(request).toContain("[REDACTED]");
  });

  it("redacts secrets in state.json on save", () => {
    const cwd = createTempCwd();
    const state = RunState.createNew(generateRunId(), minimalWorkflow, cwd, {
      task: `token=${secretToken}`,
    });

    state.updatePhase("plan", { status: "running", error: `key=sk-abcdefghijklmnopqrstuvwxyz` });
    state.save();

    const saved = readFileSync(join(state.runDir, "state.json"), "utf-8");
    expect(saved).not.toContain(secretToken);
    expect(saved).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(saved).toContain("[REDACTED]");
  });
});
