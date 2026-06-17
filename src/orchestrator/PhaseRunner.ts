import type { AgentConfig } from "../schemas/agent.schema.js";
import type { Phase } from "../schemas/task.schema.js";
import { PromptComposer } from "../runners/PromptComposer.js";
import type { AgentRunner } from "../runners/types.js";
import { mergeSkillIds } from "../skills/mergeSkillIds.js";
import { SkillResolver } from "../skills/SkillResolver.js";
import type { ArtifactStore } from "./ArtifactStore.js";
import { createPhaseFailure, type RunFailure } from "./RunErrors.js";
import type { RunState } from "./RunState.js";

export interface PhaseRunnerOptions {
  cwd: string;
  runState: RunState;
  artifactStore: ArtifactStore;
  agentRunner: AgentRunner;
  taskContext: Record<string, string>;
  apiKey?: string;
  skillResolver?: SkillResolver;
}

export interface PhaseRunOutcome {
  success: boolean;
  phaseId: string;
  result?: string;
  error?: string;
  failure?: RunFailure;
  artifacts: string[];
}

export class PhaseRunner {
  private readonly skillResolver: SkillResolver;
  private readonly promptComposer: PromptComposer;

  constructor(private readonly options: PhaseRunnerOptions) {
    this.skillResolver = options.skillResolver ?? new SkillResolver();
    this.promptComposer = new PromptComposer();
  }

  async runPhase(
    phase: Phase,
    agentConfig: AgentConfig & { id: string },
  ): Promise<PhaseRunOutcome> {
    const record = this.options.runState.getPhaseRecord(phase.id);
    const maxRetries = phase.maxRetries ?? 0;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt += 1;
      record.attempts = attempt;
      record.status = attempt > 1 ? "retrying" : "running";
      record.startedAt = new Date().toISOString();
      this.options.runState.updatePhase(phase.id, record);
      this.options.runState.setCurrentPhase(phase.id);
      this.options.runState.appendPhaseLog(
        `Starting phase **${phase.id}** (attempt ${attempt}) with agent **${phase.agent}**`,
      );

      const runner = this.options.agentRunner;
      const artifactsDir = this.options.artifactStore.artifactsDir;

      const skillIds = mergeSkillIds(agentConfig.skills, phase.skills);
      const skills =
        skillIds.length > 0
          ? this.skillResolver.resolve(skillIds, { workspaceRoot: this.options.cwd })
          : undefined;

      const prompt = this.promptComposer.composePhasePrompt({
        phase: {
          id: phase.id,
          objective: phase.objective,
          inputs: phase.inputs,
          outputs: phase.outputs,
          context: phase.context,
        },
        agentConfig,
        taskContext: this.options.taskContext,
        artifactsDir,
        cwd: this.options.cwd,
        skills,
      });

      let result;
      try {
        result = await runner.run({
          agentId: phase.agent,
          agentConfig,
          prompt,
          cwd: this.options.cwd,
          runId: this.options.runState.runId,
          phaseId: phase.id,
          artifactsDir,
          context: {
            ...this.options.taskContext,
            ...(phase.context ?? {}),
          },
          apiKey: this.options.apiKey,
          skills,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        record.status = "failed";
        record.error = message;
        record.completedAt = new Date().toISOString();
        this.options.runState.updatePhase(phase.id, record);
        this.options.runState.appendPhaseLog(
          `Phase **${phase.id}** raised an exception: ${message}`,
        );
        const failure = createPhaseFailure("agent_exception", phase.id, message);
        return {
          success: false,
          phaseId: phase.id,
          error: message,
          failure,
          artifacts: [],
        };
      }

      if (result.agentSessionId) {
        this.options.runState.setAgentSession(phase.id, result.agentSessionId);
      }

      if (result.result) {
        this.options.runState.saveAgentMessage(phase.id, result.result);
        this.options.artifactStore.writeArtifact(
          `${phase.id}-output.md`,
          result.result,
        );
      }

      const expectedOutputs = phase.outputs ?? phase.requiredArtifacts ?? [];
      for (const output of expectedOutputs) {
        if (!this.options.artifactStore.hasArtifact(output) && result.result) {
          this.options.artifactStore.writeArtifact(output, result.result);
        }
      }

      const artifactNames = [
        ...new Set([...result.artifacts, ...expectedOutputs]),
      ];

      if (result.success) {
        record.status = "completed";
        record.completedAt = new Date().toISOString();
        record.artifacts = artifactNames;
        record.agentId = result.agentSessionId;
        record.runId = result.runSessionId;
        record.error = undefined;
        this.options.runState.updatePhase(phase.id, record);
        this.options.runState.appendPhaseLog(`Phase **${phase.id}** completed successfully`);

        return {
          success: true,
          phaseId: phase.id,
          result: result.result,
          artifacts: artifactNames,
        };
      }

      record.error = result.error;
      this.options.runState.updatePhase(phase.id, record);
      this.options.runState.appendPhaseLog(
        `Phase **${phase.id}** failed: ${result.error ?? "unknown error"}`,
      );

      if (attempt > maxRetries) {
        return this.handleExhaustedRetries(
          phase,
          record,
          result.error,
          artifactNames,
          createPhaseFailure(
            "agent_execution",
            phase.id,
            result.error ?? "Agent execution failed",
          ),
        );
      }
    }

    return { success: false, phaseId: phase.id, artifacts: [] };
  }

  private handleExhaustedRetries(
    phase: Phase,
    record: ReturnType<RunState["getPhaseRecord"]>,
    error: string | undefined,
    artifactNames: string[],
    failure: RunFailure,
  ): PhaseRunOutcome {
    const onFailure = phase.onFailure ?? "stop";
    record.completedAt = new Date().toISOString();

    switch (onFailure) {
      case "skip":
        record.status = "skipped";
        this.options.runState.updatePhase(phase.id, record);
        return {
          success: true,
          phaseId: phase.id,
          error,
          artifacts: artifactNames,
        };
      case "continue":
        record.status = "failed";
        this.options.runState.updatePhase(phase.id, record);
        return {
          success: true,
          phaseId: phase.id,
          error,
          artifacts: artifactNames,
        };
      case "stop":
      case "retry":
        record.status = "failed";
        this.options.runState.updatePhase(phase.id, record);
        return {
          success: false,
          phaseId: phase.id,
          error,
          failure,
          artifacts: artifactNames,
        };
      default: {
        const _exhaustive: never = onFailure;
        record.status = "failed";
        this.options.runState.updatePhase(phase.id, record);
        return {
          success: false,
          phaseId: phase.id,
          error: error ?? `Unhandled onFailure: ${String(_exhaustive)}`,
          failure,
          artifacts: artifactNames,
        };
      }
    }
  }
}
