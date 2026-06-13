import { describe, expect, it } from "vitest";
import {
  formatAcceptanceReportMarkdown,
  formatFinalReport,
} from "../orchestrator/RunReports.js";

describe("RunReports", () => {
  describe("formatAcceptanceReportMarkdown", () => {
    it("renders pass/fail status per check with attempt number", () => {
      const markdown = formatAcceptanceReportMarkdown({
        runId: "abc-123",
        timestamp: "2026-06-10T12:00:00.000Z",
        attempt: 2,
        passed: false,
        results: [
          {
            checkId: "tests",
            type: "command",
            passed: true,
            required: true,
            message: "Command succeeded",
            durationMs: 50,
          },
          {
            checkId: "lint",
            type: "command",
            passed: false,
            required: false,
            message: "Command failed",
            durationMs: 30,
          },
        ],
      });

      expect(markdown).toContain("Run: abc-123");
      expect(markdown).toContain("Attempt: 2");
      expect(markdown).toContain("Passed: No");
      expect(markdown).toContain("**tests** (command): PASS");
      expect(markdown).toContain("**lint** (command): FAIL (optional)");
    });
  });

  describe("formatFinalReport", () => {
    it("lists phases and includes error section when failed", () => {
      const markdown = formatFinalReport({
        runId: "run-1",
        workflowName: "demo",
        updatedAt: "2026-06-10T12:00:00.000Z",
        runDir: "C:\\Projects\\app\\.runs\\run-1",
        success: false,
        error: "Acceptance criteria failed",
        phases: [
          { phaseId: "plan", status: "completed", attempts: 1, artifacts: [] },
          { phaseId: "implement", status: "failed", attempts: 2, artifacts: [] },
        ],
      });

      expect(markdown).toContain("**Status:** Failed");
      expect(markdown).toContain("plan: completed");
      expect(markdown).toContain("implement: failed");
      expect(markdown).toContain("## Error");
      expect(markdown).toContain("Acceptance criteria failed");
    });

    it("includes partial progress and structured failure when provided", () => {
      const markdown = formatFinalReport({
        runId: "run-3",
        workflowName: "demo",
        updatedAt: "2026-06-10T12:00:00.000Z",
        runDir: "C:\\Projects\\app\\.runs\\run-3",
        success: false,
        failure: {
          scope: "phase",
          kind: "agent_execution",
          phaseId: "implement",
          message: "Agent execution failed",
        },
        phases: [
          { phaseId: "plan", status: "completed", attempts: 1, artifacts: ["plan.md"] },
          { phaseId: "implement", status: "failed", attempts: 2, artifacts: [], error: "timeout" },
        ],
      });

      expect(markdown).toContain("## Partial progress");
      expect(markdown).toContain("## Failure");
      expect(markdown).toContain("[phase/agent_execution]");
      expect(markdown).toContain("artifacts: plan.md");
      expect(markdown).toContain("error: timeout");
    });

    it("shows completed status without error section", () => {
      const markdown = formatFinalReport({
        runId: "run-2",
        workflowName: "demo",
        updatedAt: "2026-06-10T12:00:00.000Z",
        runDir: "C:\\Projects\\app\\.runs\\run-2",
        success: true,
        phases: [{ phaseId: "plan", status: "completed", attempts: 1, artifacts: [] }],
      });

      expect(markdown).toContain("**Status:** Completed");
      expect(markdown).not.toContain("## Error");
    });
  });
});
