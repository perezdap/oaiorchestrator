import type { TaskInput } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";
import { OpenAiChatRunner } from "../runners/openAiChatRunner.js";
import type { AgentRunner } from "../runners/types.js";
import { NodeShellRunner } from "../runners/shellRunner.js";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { AcceptanceRunner } from "./AcceptanceRunner.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { ArtifactStore } from "./ArtifactStore.js";
import { PhaseRunner } from "./PhaseRunner.js";
import { prepareRunForResume } from "./RunRecovery.js";
import { Run, type RunWorkflowResult } from "./Run.js";
import { generateRunId, RunState } from "./RunState.js";
import { TaskGraph } from "./TaskGraph.js";
import { noopRunProgress, type RunProgressReporter } from "./RunProgress.js";

export type { RunWorkflowResult } from "./Run.js";
export type { RunContext } from "./Run.js";

export interface OrchestratorOptions {
  cwd?: string;
  apiKey?: string;
  agentRunner?: AgentRunner;
  shellRunner?: NodeShellRunner;
  approvalPolicy?: ApprovalPolicy;
  dryRun?: boolean;
  progress?: RunProgressReporter;
}

export interface RunWorkflowInput {
  workflow: Workflow;
  inputs?: TaskInput;
  runId?: string;
  resume?: boolean;
}

interface InternalRunContext {
  cwd: string;
  runState: RunState;
  artifactStore: ArtifactStore;
  registry: AgentRegistry;
  phaseRunner: PhaseRunner;
  acceptanceRunner: AcceptanceRunner;
}

export class Orchestrator {
  private readonly cwd: string;
  private readonly agentRunner: AgentRunner;
  private readonly shellRunner: NodeShellRunner;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly apiKey?: string;
  private readonly dryRun: boolean;
  private readonly progress: RunProgressReporter;

  constructor(options: OrchestratorOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.apiKey = options.apiKey;
    this.agentRunner =
      options.agentRunner ?? new OpenAiChatRunner({ apiKey: options.apiKey });
    this.shellRunner = options.shellRunner ?? new NodeShellRunner({ enforcePolicy: true });
    this.approvalPolicy = options.approvalPolicy ?? new ApprovalPolicy();
    this.dryRun = options.dryRun ?? false;
    this.progress = options.progress ?? noopRunProgress;
  }

  async run(input: RunWorkflowInput): Promise<RunWorkflowResult> {
    const registry = new AgentRegistry();
    registry.registerWorkflowMcpServers(input.workflow.mcpServers ?? []);
    registry.registerWorkflowAgents(input.workflow.agents);

    const taskInputs = this.normalizeInputs(input.workflow, input.inputs);
    const cwd = String(taskInputs.repoPath ?? this.cwd);

    let runState: RunState;
    let recoverySummary;
    if (input.resume && input.runId) {
      const runDir = RunState.findRunDir(cwd, input.runId);
      runState = RunState.load(runDir);
      recoverySummary = prepareRunForResume(runState);
    } else {
      const runId = input.runId ?? generateRunId();
      runState = RunState.createNew(runId, input.workflow, cwd, taskInputs);
    }

    const ctx = this.createRunContext({
      cwd,
      runState,
      registry,
      taskInputs,
    });

    const taskGraph = new TaskGraph(input.workflow.phases);
    const executionOrder = taskGraph.getExecutionOrder();

    const run = new Run({
      runState: ctx.runState,
      phaseRunner: ctx.phaseRunner,
      acceptanceRunner: ctx.acceptanceRunner,
      registry: ctx.registry,
      progress: this.progress,
      dryRun: this.dryRun,
    });

    if (recoverySummary && recoverySummary.resumablePhaseIds.length === 0) {
      ctx.runState.appendPhaseLog("Resume skipped — all phases already completed");
    }

    return run.execute(input.workflow, executionOrder);
  }

  private createRunContext(params: {
    cwd: string;
    runState: RunState;
    registry: AgentRegistry;
    taskInputs: Record<string, unknown>;
  }): InternalRunContext {
    const artifactStore = new ArtifactStore(params.runState.runDir, params.cwd);
    const taskContext = this.toStringContext(params.taskInputs);

    const phaseRunner = new PhaseRunner({
      cwd: params.cwd,
      runState: params.runState,
      artifactStore,
      agentRunner: this.agentRunner,
      taskContext,
      apiKey: this.apiKey,
    });

    const acceptanceRunner = this.createAcceptanceRunner(
      params.cwd,
      params.runState,
      artifactStore,
      params.registry,
    );

    return {
      cwd: params.cwd,
      runState: params.runState,
      artifactStore,
      registry: params.registry,
      phaseRunner,
      acceptanceRunner,
    };
  }

  private createAcceptanceRunner(
    cwd: string,
    runState: RunState,
    artifactStore: ArtifactStore,
    registry: AgentRegistry,
  ): AcceptanceRunner {
    return new AcceptanceRunner({
      cwd,
      runId: runState.runId,
      shellRunner: this.shellRunner,
      agentRunner: this.agentRunner,
      approvalPolicy: this.approvalPolicy,
      artifactsDir: artifactStore.artifactsDir,
      resolveAgentConfig: (agentId) =>
        registry.hasAgent(agentId) ? registry.resolve(agentId) : undefined,
    });
  }

  private normalizeInputs(
    workflow: Workflow,
    inputs?: TaskInput,
  ): Record<string, unknown> {
    return {
      ...(workflow.inputs ?? {}),
      ...(inputs ?? {}),
    };
  }

  private toStringContext(inputs: Record<string, unknown>): Record<string, string> {
    const ctx: Record<string, string> = {};
    for (const [key, value] of Object.entries(inputs)) {
      ctx[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return ctx;
  }
}
