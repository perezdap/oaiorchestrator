import type { AgentConfig } from "../schemas/agent.schema.js";
import type { Phase } from "../schemas/task.schema.js";
import { AcceptanceGate } from "./AcceptanceGate.js";
import type { AcceptanceRunner } from "./AcceptanceRunner.js";
import { createPhaseFailure, type RunFailure } from "./RunErrors.js";
import type { PhaseRunner } from "./PhaseRunner.js";
import { startHeartbeat, type RunProgressReporter } from "./RunProgress.js";
import type { RunState } from "./RunState.js";

export interface PhaseExecutorOptions {
  phaseRunner: PhaseRunner;
  acceptanceRunner: AcceptanceRunner;
  runState: RunState;
  progress: RunProgressReporter;
  dryRun: boolean;
}

export interface PhaseExecutionMeta {
  phaseIndex: number;
  phasesTotal: number;
}

export interface PhaseExecutionResult {
  success: boolean;
  error?: string;
  failure?: RunFailure;
}

export class PhaseExecutor {
  constructor(private readonly options: PhaseExecutorOptions) {}

  async executePhase(
    phase: Phase,
    agentConfig: AgentConfig & { id: string },
    meta: PhaseExecutionMeta,
  ): Promise<PhaseExecutionResult> {
    this.options.progress.phaseStarted({
      phaseIndex: meta.phaseIndex,
      phasesTotal: meta.phasesTotal,
      phaseId: phase.id,
      agentId: phase.agent,
      model: agentConfig.model,
      attempt: 1,
      dryRun: this.options.dryRun,
    });

    const phaseStartedAt = Date.now();

    if (this.options.dryRun) {
      this.options.runState.updatePhase(phase.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        attempts: 1,
      });
      this.options.progress.phaseFinished({
        phaseId: phase.id,
        success: true,
        durationMs: Date.now() - phaseStartedAt,
      });
      return { success: true };
    }

    const stopHeartbeat = startHeartbeat((elapsedMs) => {
      this.options.progress.heartbeat({
        phaseId: phase.id,
        agentId: phase.agent,
        elapsedMs,
      });
    });

    let outcome;
    try {
      outcome = await this.options.phaseRunner.runPhase(phase, agentConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        failure: createPhaseFailure("agent_exception", phase.id, message),
      };
    } finally {
      stopHeartbeat();
    }

    this.options.progress.phaseFinished({
      phaseId: phase.id,
      success: outcome.success,
      durationMs: Date.now() - phaseStartedAt,
      error: outcome.error,
    });

    if (!outcome.success) {
      return {
        success: false,
        error: outcome.error,
        failure: outcome.failure,
      };
    }

    if (phase.acceptance?.length) {
      const maxAttempts = (phase.maxRetries ?? 0) + 1;
      this.options.progress.acceptanceStarted({
        scope: "phase",
        phaseId: phase.id,
        criteriaCount: phase.acceptance.length,
        maxAttempts,
      });

      const gate = this.createAcceptanceGate({
        onAttemptStart: (attempt, total) => {
          this.options.progress.acceptanceAttempt({
            scope: "phase",
            phaseId: phase.id,
            attempt,
            maxAttempts: total,
          });
        },
      });

      const acceptance = await gate.evaluate(phase.acceptance, {
        maxRetries: phase.maxRetries ?? 0,
      });

      this.options.progress.acceptanceFinished({
        scope: "phase",
        phaseId: phase.id,
        passed: acceptance.passed,
        attempts: acceptance.attempts,
      });

      if (!acceptance.passed) {
        const failure = createPhaseFailure(
          "phase_acceptance",
          phase.id,
          "Phase acceptance criteria failed",
        );
        return {
          success: false,
          error: failure.message,
          failure,
        };
      }
    }

    return { success: true };
  }

  private createAcceptanceGate(options?: {
    onAttemptStart?: (attempt: number, maxAttempts: number) => void;
    onAttemptFailed?: (attempt: number) => Promise<void>;
  }): AcceptanceGate {
    return new AcceptanceGate({
      acceptanceRunner: this.options.acceptanceRunner,
      persistReport: (report) => this.options.runState.writeAcceptanceReport(report),
      onAttemptStart: options?.onAttemptStart,
      onAttemptFailed: options?.onAttemptFailed,
    });
  }
}
