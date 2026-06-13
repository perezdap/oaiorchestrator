import type { PhaseStatus } from "../schemas/task.schema.js";
import type { RunFailure } from "./RunErrors.js";
import { formatRunFailure } from "./RunErrors.js";
import type { RunState } from "./RunState.js";
import type { RunStateData } from "./RunRecord.js";

const INTERRUPTED_PHASE_STATUSES: readonly PhaseStatus[] = ["running", "retrying"];

export interface ResumeRecoverySummary {
  priorRunStatus: RunStateData["status"];
  interruptedPhases: string[];
  resetPhaseIds: string[];
  resumablePhaseIds: string[];
}

/**
 * Normalizes persisted state before resuming a run after a crash or explicit failure.
 * Interrupted phases (running/retrying) are reset to pending so they re-execute.
 */
export function prepareRunForResume(runState: RunState): ResumeRecoverySummary {
  const data = runState.toJSON();
  const interruptedPhases: string[] = [];
  const resetPhaseIds: string[] = [];

  for (const phase of data.phases) {
    if (INTERRUPTED_PHASE_STATUSES.includes(phase.status)) {
      interruptedPhases.push(phase.phaseId);
      runState.updatePhase(phase.phaseId, { status: "pending" });
      resetPhaseIds.push(phase.phaseId);
    }
  }

  if (data.currentPhaseId && resetPhaseIds.includes(data.currentPhaseId)) {
    runState.setCurrentPhase(undefined);
  }

  if (data.status === "failed" || data.status === "running") {
    runState.setStatus("running");
  }

  const resumablePhaseIds = runState.toJSON().phases
    .filter((p) => p.status === "pending" || p.status === "failed")
    .map((p) => p.phaseId);

  if (interruptedPhases.length > 0) {
    runState.appendPhaseLog(
      `Resuming after interruption — reset ${interruptedPhases.length} phase(s): ${interruptedPhases.join(", ")}`,
    );
  } else if (data.status === "failed") {
    runState.appendPhaseLog(
      "Resuming after workflow failure — continuing from incomplete phases",
    );
  }

  return {
    priorRunStatus: data.status,
    interruptedPhases,
    resetPhaseIds,
    resumablePhaseIds,
  };
}

/** Logs per-phase partial progress when a workflow aborts before completion. */
export function logPartialResults(runState: RunState, failure?: RunFailure): void {
  const data = runState.toJSON();
  const completed = data.phases.filter(
    (p) => p.status === "completed" || p.status === "skipped",
  );
  const incomplete = data.phases.filter(
    (p) => p.status !== "completed" && p.status !== "skipped",
  );

  runState.appendPhaseLog(
    `Workflow aborted — ${completed.length} phase(s) completed, ${incomplete.length} incomplete`,
  );

  for (const phase of data.phases) {
    const artifacts =
      phase.artifacts.length > 0 ? ` artifacts: ${phase.artifacts.join(", ")}` : "";
    const err = phase.error ? ` error: ${phase.error}` : "";
    runState.appendPhaseLog(
      `  - ${phase.phaseId}: ${phase.status} (attempts: ${phase.attempts})${artifacts}${err}`,
    );
  }

  if (failure) {
    runState.appendPhaseLog(`Failure: ${formatRunFailure(failure)}`);
  }
}
