import type { ExecutionMode } from "../schemas/agent.schema.js";
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
import {
  CloudRepoUrlRequiredError,
  resolveRunRepoUrl,
  type ResolveRunRepoUrlResult,
} from "../util/resolveRepoUrl.js";

export type { RunWorkflowResult } from "./Run.js";
export type { RunContext } from "./Run.js";

export interface OrchestratorOptions {
  cwd?: string;
  apiKey?: string;
  executionMode?: ExecutionMode;
  agentRunner?: AgentRunner;
  localRunner?: AgentRunner;
  cloudRunner?: AgentRunner;
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
  private readonly defaultExecutionMode: ExecutionMode;
  private readonly localRunner: AgentRunner;
  private readonly cloudRunner: AgentRunner;
  private readonly shellRunner: NodeShellRunner;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly apiKey?: string;
  private readonly dryRun: boolean;
  private readonly overrideRunner?: AgentRunner;
  private readonly progress: RunProgressReporter;

  constructor(options: OrchestratorOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.defaultExecutionMode = options.executionMode ?? "local";
    this.apiKey = options.apiKey;
    const defaultRunner = new OpenAiChatRunner({ apiKey: options.apiKey });
    this.localRunner = options.localRunner ?? options.agentRunner ?? defaultRunner;
    // Cloud mode is an alias for the same OpenAI-compatible runner until a hosted variant exists.
    this.cloudRunner = options.cloudRunner ?? defaultRunner;
    this.shellRunner = options.shellRunner ?? new NodeShellRunner({ enforcePolicy: true });
    this.approvalPolicy = options.approvalPolicy ?? new ApprovalPolicy();
    this.dryRun = options.dryRun ?? false;
    this.overrideRunner = options.agentRunner;
    this.progress = options.progress ?? noopRunProgress;
  }

  async run(input: RunWorkflowInput): Promise<RunWorkflowResult> {
    const registry = new AgentRegistry();
    registry.registerWorkflowAgents(input.workflow.agents);

    let taskInputs = this.normalizeInputs(input.workflow, input.inputs);
    const cwd = String(taskInputs.repoPath ?? this.cwd);
    const executionMode = this.resolveRunExecutionMode(taskInputs);
    const resolvedRepo = this.resolveCloudRepoUrl(cwd, executionMode, taskInputs);
    taskInputs = this.applyCloudRepoUrl(taskInputs, executionMode, resolvedRepo);

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
      executionMode,
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
      executionMode,
      repoUrl: resolvedRepo.repoUrl,
      repoUrlSource: resolvedRepo.source,
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
    executionMode: ExecutionMode;
    taskInputs: Record<string, unknown>;
  }): InternalRunContext {
    const artifactStore = new ArtifactStore(params.runState.runDir, params.cwd);
    const taskContext = this.toStringContext(params.taskInputs);

    const phaseRunner = new PhaseRunner({
      cwd: params.cwd,
      runState: params.runState,
      artifactStore,
      getRunner: (mode) => this.getRunner(mode),
      defaultExecutionMode: params.executionMode,
      taskContext,
      apiKey: this.apiKey,
    });

    const acceptanceRunner = this.createAcceptanceRunner(
      params.cwd,
      params.runState,
      artifactStore,
      params.executionMode,
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
    executionMode: ExecutionMode,
    registry: AgentRegistry,
  ): AcceptanceRunner {
    return new AcceptanceRunner({
      cwd,
      runId: runState.runId,
      shellRunner: this.shellRunner,
      agentRunner: this.getRunner(executionMode),
      approvalPolicy: this.approvalPolicy,
      artifactsDir: artifactStore.artifactsDir,
      resolveAgentConfig: (agentId) =>
        registry.hasAgent(agentId) ? registry.resolve(agentId) : undefined,
    });
  }

  private getRunner(mode: ExecutionMode): AgentRunner {
    if (this.overrideRunner) return this.overrideRunner;
    if (mode === "cloud") return this.cloudRunner;
    return this.localRunner;
  }

  private resolveRunExecutionMode(inputs: Record<string, unknown>): ExecutionMode {
    const mode = inputs.executionMode;
    if (mode === "local" || mode === "cloud") {
      return mode;
    }
    return this.defaultExecutionMode;
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

  private resolveCloudRepoUrl(
    repoPath: string,
    executionMode: ExecutionMode,
    inputs: Record<string, unknown>,
  ): ResolveRunRepoUrlResult {
    if (executionMode !== "cloud") {
      return {};
    }

    const repoUrl = typeof inputs.repoUrl === "string" ? inputs.repoUrl : undefined;
    const resolved = resolveRunRepoUrl({ repoPath, executionMode: "cloud", repoUrl });

    if (!resolved.repoUrl) {
      throw new CloudRepoUrlRequiredError();
    }

    return resolved;
  }

  private applyCloudRepoUrl(
    inputs: Record<string, unknown>,
    executionMode: ExecutionMode,
    resolved: ResolveRunRepoUrlResult,
  ): Record<string, unknown> {
    if (executionMode !== "cloud") {
      const withoutRepoUrl = { ...inputs };
      delete withoutRepoUrl.repoUrl;
      return withoutRepoUrl;
    }

    if (!resolved.repoUrl) {
      return inputs;
    }

    return { ...inputs, repoUrl: resolved.repoUrl };
  }

  private toStringContext(inputs: Record<string, unknown>): Record<string, string> {
    const ctx: Record<string, string> = {};
    for (const [key, value] of Object.entries(inputs)) {
      ctx[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return ctx;
  }
}
