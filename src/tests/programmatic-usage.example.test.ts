import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProgrammaticExample } from "../examples/programmatic-usage.example.js";

describe("programmatic-usage.example", () => {
  it("completes a workflow with MockAgentRunner and produces artifacts", async () => {
    const summary = await runProgrammaticExample();

    expect(summary.status).toBe("completed");
    expect(summary.acceptancePassed).toBe(true);
    expect(summary.phasesCompleted).toBe(2);
    expect(summary.phasesTotal).toBe(2);
    expect(summary.runId.length).toBeGreaterThan(0);
    expect(existsSync(summary.runDir)).toBe(true);
    expect(existsSync(summary.planArtifactPath)).toBe(true);

    const plan = readFileSync(summary.planArtifactPath, "utf-8");
    expect(plan).toContain("Example plan");

    expect(existsSync(join(summary.runDir, "acceptance-report.json"))).toBe(true);
    expect(existsSync(join(summary.runDir, "final-report.md"))).toBe(true);
  });
});
