import { join } from "node:path";
import type { AcceptanceReport } from "../schemas/acceptance.schema.js";
import type { PhaseRunRecord } from "../schemas/task.schema.js";
import { formatRunFailure, type RunFailure } from "./RunErrors.js";

export function formatAcceptanceReportMarkdown(report: AcceptanceReport): string {
  return [
    "# Acceptance Report",
    "",
    `Run: ${report.runId}`,
    `Attempt: ${report.attempt}`,
    `Passed: ${report.passed ? "Yes" : "No"}`,
    "",
    "## Results",
    ...report.results.map(
      (r) =>
        `- **${r.checkId}** (${r.type}): ${r.passed ? "PASS" : "FAIL"}${r.required ? "" : " (optional)"} — ${r.message}`,
    ),
  ].join("\n");
}

export interface FinalReportInput {
  runId: string;
  workflowName: string;
  updatedAt: string;
  runDir: string;
  phases: PhaseRunRecord[];
  success: boolean;
  error?: string;
  failure?: RunFailure;
}

export function formatFinalReport(input: FinalReportInput): string {
  const lines = [
    "# Final Report",
    "",
    `**Run ID:** ${input.runId}`,
    `**Workflow:** ${input.workflowName}`,
    `**Status:** ${input.success ? "Completed" : "Failed"}`,
    `**Updated:** ${input.updatedAt}`,
    "",
    "## Phases",
  ];

  for (const phase of input.phases) {
    const artifacts =
      phase.artifacts.length > 0 ? `, artifacts: ${phase.artifacts.join(", ")}` : "";
    const phaseError = phase.error ? `, error: ${phase.error}` : "";
    lines.push(
      `- ${phase.phaseId}: ${phase.status} (attempts: ${phase.attempts})${artifacts}${phaseError}`,
    );
  }

  const incomplete = input.phases.filter(
    (p) => p.status !== "completed" && p.status !== "skipped",
  );
  if (!input.success && incomplete.length > 0) {
    lines.push("", "## Partial progress");
    lines.push(
      `${input.phases.length - incomplete.length}/${input.phases.length} phases finished before abort.`,
    );
  }

  if (input.failure) {
    lines.push("", "## Failure", formatRunFailure(input.failure));
  } else if (input.error) {
    lines.push("", "## Error", input.error);
  }

  lines.push("", `Artifacts: ${join(input.runDir, "artifacts")}`);
  return lines.join("\n");
}
