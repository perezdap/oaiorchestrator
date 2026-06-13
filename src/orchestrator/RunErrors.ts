/**
 * Run engine error model.
 *
 * Failures are classified by **scope** (where they occurred) and **kind** (what failed).
 * Phase-scoped failures stop the workflow unless `onFailure: continue|skip` applies.
 * Workflow-scoped failures occur after all phases complete, during workflow acceptance.
 *
 * @see docs/error-recovery.md
 */

export type RunFailureScope = "phase" | "workflow";

export type RunFailureKind =
  | "agent_execution"
  | "agent_exception"
  | "phase_acceptance"
  | "workflow_acceptance";

export interface RunFailure {
  scope: RunFailureScope;
  kind: RunFailureKind;
  message: string;
  phaseId?: string;
  cause?: string;
}

export function createPhaseFailure(
  kind: Extract<RunFailureKind, "agent_execution" | "agent_exception" | "phase_acceptance">,
  phaseId: string,
  message: string,
  cause?: string,
): RunFailure {
  return { scope: "phase", kind, phaseId, message, cause };
}

export function createWorkflowFailure(
  message: string,
  cause?: string,
): RunFailure {
  return { scope: "workflow", kind: "workflow_acceptance", message, cause };
}

export function formatRunFailure(failure: RunFailure): string {
  const location =
    failure.scope === "phase" && failure.phaseId
      ? `phase "${failure.phaseId}"`
      : "workflow";
  const detail = failure.cause ? `: ${failure.cause}` : "";
  return `[${failure.scope}/${failure.kind}] ${location} — ${failure.message}${detail}`;
}

export function failureMessage(failure: RunFailure): string {
  return formatRunFailure(failure);
}
