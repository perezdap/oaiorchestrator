import type { PhaseRunRecord, PhaseStatus } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";
import type { RunArchive } from "./RunArchive.js";

export interface RunStateData {
  runId: string;
  workflowName: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  createdAt: string;
  updatedAt: string;
  cwd: string;
  inputs: Record<string, unknown>;
  phases: PhaseRunRecord[];
  currentPhaseId?: string;
  acceptanceAttempt: number;
  agentSessionIds: Record<string, string>;
}

export class RunRecord {
  private data: RunStateData;

  constructor(
    data: RunStateData,
    private readonly archive?: RunArchive,
  ) {
    this.data = data;
  }

  static createInitialData(
    runId: string,
    workflow: Workflow,
    cwd: string,
    inputs: Record<string, unknown>,
  ): RunStateData {
    const now = new Date().toISOString();
    return {
      runId,
      workflowName: workflow.name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      cwd,
      inputs,
      phases: workflow.phases.map((p) => ({
        phaseId: p.id,
        status: "pending" as PhaseStatus,
        attempts: 0,
        artifacts: [],
      })),
      acceptanceAttempt: 0,
      agentSessionIds: {},
    };
  }

  get runId(): string {
    return this.data.runId;
  }

  get status(): RunStateData["status"] {
    return this.data.status;
  }

  get phases(): PhaseRunRecord[] {
    return this.data.phases;
  }

  getPhaseRecord(phaseId: string): PhaseRunRecord {
    const record = this.data.phases.find((p) => p.phaseId === phaseId);
    if (!record) {
      throw new Error(`Phase record not found: ${phaseId}`);
    }
    return record;
  }

  updatePhase(phaseId: string, update: Partial<PhaseRunRecord>): void {
    const record = this.getPhaseRecord(phaseId);
    Object.assign(record, update);
    this.touch();
  }

  setStatus(status: RunStateData["status"]): void {
    this.data.status = status;
    this.touch();
  }

  setCurrentPhase(phaseId: string | undefined): void {
    this.data.currentPhaseId = phaseId;
    this.touch();
  }

  incrementAcceptanceAttempt(): number {
    this.data.acceptanceAttempt += 1;
    this.touch();
    return this.data.acceptanceAttempt;
  }

  setAgentSession(phaseId: string, agentSessionId: string): void {
    this.data.agentSessionIds[phaseId] = agentSessionId;
    this.touch();
  }

  toJSON(): RunStateData {
    return { ...this.data };
  }

  getData(): RunStateData {
    return this.data;
  }

  touch(): void {
    this.data.updatedAt = new Date().toISOString();
    this.archive?.save(this);
  }
}
