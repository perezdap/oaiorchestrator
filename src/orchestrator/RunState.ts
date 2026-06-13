import type { AcceptanceReport } from "../schemas/acceptance.schema.js";
import type { PhaseRunRecord } from "../schemas/task.schema.js";
import type { Workflow } from "../schemas/workflow.schema.js";
import { RunArchive } from "./RunArchive.js";
import { RunRecord, type RunStateData } from "./RunRecord.js";

export type { RunStateData } from "./RunRecord.js";

export class RunState {
  private readonly archive: RunArchive;
  private readonly record: RunRecord;

  constructor(archive: RunArchive, record: RunRecord) {
    this.archive = archive;
    this.record = record;
  }

  static createNew(
    runId: string,
    workflow: Workflow,
    cwd: string,
    inputs: Record<string, unknown>,
  ): RunState {
    const { archive, record } = RunArchive.createNew(runId, workflow, cwd, inputs);
    return new RunState(archive, record);
  }

  static load(runDir: string): RunState {
    const { archive, record } = RunArchive.load(runDir);
    return new RunState(archive, record);
  }

  static findRunDir(cwd: string, runId: string): string {
    return RunArchive.findRunDir(cwd, runId);
  }

  get runDir(): string {
    return this.archive.runDir;
  }

  get runId(): string {
    return this.record.runId;
  }

  get status(): RunStateData["status"] {
    return this.record.status;
  }

  get phases(): PhaseRunRecord[] {
    return this.record.phases;
  }

  getPhaseRecord(phaseId: string): PhaseRunRecord {
    return this.record.getPhaseRecord(phaseId);
  }

  updatePhase(phaseId: string, update: Partial<PhaseRunRecord>): void {
    this.record.updatePhase(phaseId, update);
  }

  setStatus(status: RunStateData["status"]): void {
    this.record.setStatus(status);
  }

  setCurrentPhase(phaseId: string | undefined): void {
    this.record.setCurrentPhase(phaseId);
  }

  incrementAcceptanceAttempt(): number {
    return this.record.incrementAcceptanceAttempt();
  }

  setAgentSession(phaseId: string, agentSessionId: string): void {
    this.record.setAgentSession(phaseId, agentSessionId);
  }

  appendPhaseLog(entry: string): void {
    this.archive.appendPhaseLog(entry);
  }

  saveAgentMessage(phaseId: string, content: string): void {
    this.archive.saveAgentMessage(phaseId, content);
  }

  persistWorkflow(workflow: Workflow): void {
    this.archive.persistWorkflow(workflow);
  }

  persistRequest(inputs: Record<string, unknown>): void {
    this.archive.persistRequest(inputs);
  }

  writeAcceptanceReport(report: AcceptanceReport): void {
    this.archive.writeAcceptanceReport(report);
  }

  writeFinalReport(content: string): void {
    this.archive.writeFinalReport(content);
  }

  save(): void {
    this.archive.save(this.record);
  }

  toJSON(): RunStateData {
    return this.record.toJSON();
  }
}

export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
