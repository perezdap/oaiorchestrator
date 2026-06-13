import type { AgentConfig, ExecutionMode } from "../schemas/agent.schema.js";
import type { ResolvedSkill } from "../skills/SkillResolver.js";

export interface AgentRunInput {
  agentId: string;
  agentConfig: AgentConfig;
  prompt: string;
  cwd: string;
  executionMode: ExecutionMode;
  runId: string;
  phaseId: string;
  artifactsDir: string;
  context?: Record<string, string>;
  apiKey?: string;
  skills?: ResolvedSkill[];
}

export interface AgentRunResult {
  success: boolean;
  status: "finished" | "error" | "cancelled";
  result?: string;
  agentSessionId?: string;
  runSessionId?: string;
  error?: string;
  artifacts: string[];
}

export interface AgentRunner {
  readonly name: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface ShellRunInput {
  command: string;
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ShellRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ShellRunner {
  run(input: ShellRunInput): Promise<ShellRunResult>;
}
