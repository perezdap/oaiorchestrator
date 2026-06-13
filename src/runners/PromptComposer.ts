import type { AgentConfig } from "../schemas/agent.schema.js";
import type { ResolvedSkill } from "../skills/SkillResolver.js";
import {
  buildPhaseInputArtifacts,
  buildPhasePromptBody,
  composeAgentPrompt,
} from "./composeAgentPrompt.js";

export interface ComposePhasePromptPhase {
  id: string;
  objective: string;
  inputs?: string[];
  outputs?: string[];
  context?: Record<string, string>;
}

export interface ComposePhasePromptOptions {
  phase: ComposePhasePromptPhase;
  agentConfig: AgentConfig;
  taskContext: Record<string, string>;
  artifactsDir: string;
  cwd: string;
  skills?: ResolvedSkill[];
}

export class PromptComposer {
  composePhasePrompt(options: ComposePhasePromptOptions): string {
    const { phase, agentConfig, taskContext, artifactsDir, cwd, skills } = options;

    // Fall back to the agent type's default inputs when the phase omits them,
    // and drop context keys (e.g. "task") so they aren't read as artifact files.
    const contextKeys = new Set(
      Object.keys({ ...taskContext, ...(phase.context ?? {}) }),
    );
    const declaredInputs = phase.inputs ?? agentConfig.inputs;
    const artifactInputs = declaredInputs?.filter((name) => !contextKeys.has(name));

    const body = buildPhasePromptBody({
      objective: phase.objective,
      task: taskContext.task,
      inputArtifacts: buildPhaseInputArtifacts(artifactsDir, artifactInputs),
      outputArtifacts: phase.outputs,
    });

    return composeAgentPrompt({
      agentId: agentConfig.type,
      agentConfig,
      prompt: body,
      cwd,
      executionMode: "local",
      runId: "",
      phaseId: phase.id,
      artifactsDir,
      context: {
        ...taskContext,
        ...(phase.context ?? {}),
      },
      skills,
    });
  }
}
