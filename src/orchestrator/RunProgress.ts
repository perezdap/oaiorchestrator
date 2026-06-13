export interface WorkflowStartedEvent {
  runId: string;
  workflowName: string;
  phasesTotal: number;
  executionMode: string;
  dryRun: boolean;
  repoUrl?: string;
  repoUrlSource?: "flag" | "git";
}

export interface PhaseStartedEvent {
  phaseIndex: number;
  phasesTotal: number;
  phaseId: string;
  agentId: string;
  model: string;
  attempt: number;
  dryRun: boolean;
}

export interface PhaseFinishedEvent {
  phaseId: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface AcceptanceStartedEvent {
  scope: "phase" | "workflow";
  phaseId?: string;
  criteriaCount: number;
  maxAttempts: number;
}

export interface AcceptanceAttemptEvent {
  scope: "phase" | "workflow";
  phaseId?: string;
  attempt: number;
  maxAttempts: number;
}

export interface AcceptanceFinishedEvent {
  scope: "phase" | "workflow";
  phaseId?: string;
  passed: boolean;
  attempts: number;
}

export interface HeartbeatEvent {
  phaseId: string;
  agentId: string;
  elapsedMs: number;
}

export interface WorkflowFinishedEvent {
  runId: string;
  status: "completed" | "failed";
  durationMs: number;
  message: string;
}

export interface RunProgressReporter {
  workflowStarted(event: WorkflowStartedEvent): void;
  phaseStarted(event: PhaseStartedEvent): void;
  phaseFinished(event: PhaseFinishedEvent): void;
  acceptanceStarted(event: AcceptanceStartedEvent): void;
  acceptanceAttempt(event: AcceptanceAttemptEvent): void;
  acceptanceFinished(event: AcceptanceFinishedEvent): void;
  heartbeat(event: HeartbeatEvent): void;
  workflowFinished(event: WorkflowFinishedEvent): void;
}

export const noopRunProgress: RunProgressReporter = {
  workflowStarted: () => undefined,
  phaseStarted: () => undefined,
  phaseFinished: () => undefined,
  acceptanceStarted: () => undefined,
  acceptanceAttempt: () => undefined,
  acceptanceFinished: () => undefined,
  heartbeat: () => undefined,
  workflowFinished: () => undefined,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function prefix(): string {
  return "[orchestrator]";
}

export class ConsoleRunProgress implements RunProgressReporter {
  constructor(private readonly stream: NodeJS.WritableStream = process.stderr) {}

  private write(line: string): void {
    this.stream.write(`${line}\n`);
  }

  workflowStarted(event: WorkflowStartedEvent): void {
    const mode = event.dryRun ? "dry-run" : event.executionMode;
    this.write(
      `${prefix()} Run ${event.runId} started — ${event.workflowName} (${event.phasesTotal} phases, ${mode})`,
    );
    if (event.repoUrl) {
      const via =
        event.repoUrlSource === "git" ? "auto-detected from origin" : "from --repo-url";
      this.write(`${prefix()} Cloud repository (${via}): ${event.repoUrl}`);
    }
  }

  phaseStarted(event: PhaseStartedEvent): void {
    const attempt =
      event.attempt > 1 ? `, attempt ${event.attempt}` : "";
    const suffix = event.dryRun ? "simulating" : "running";
    this.write(
      `${prefix()} [${event.phaseIndex}/${event.phasesTotal}] Phase ${event.phaseId} — ${event.agentId} (${event.model}) … ${suffix}${attempt}`,
    );
  }

  phaseFinished(event: PhaseFinishedEvent): void {
    const status = event.success ? "done" : "failed";
    const detail = event.error ? ` — ${event.error}` : "";
    this.write(
      `${prefix()} Phase ${event.phaseId} ${status} (${formatDuration(event.durationMs)})${detail}`,
    );
  }

  acceptanceStarted(event: AcceptanceStartedEvent): void {
    const label =
      event.scope === "phase" ? `phase ${event.phaseId}` : "workflow";
    this.write(
      `${prefix()} Running ${label} acceptance (${event.criteriaCount} checks, up to ${event.maxAttempts} attempt(s)) …`,
    );
  }

  acceptanceAttempt(event: AcceptanceAttemptEvent): void {
    const label =
      event.scope === "phase" ? `phase ${event.phaseId}` : "workflow";
    this.write(
      `${prefix()} ${label} acceptance attempt ${event.attempt}/${event.maxAttempts} …`,
    );
  }

  acceptanceFinished(event: AcceptanceFinishedEvent): void {
    const label =
      event.scope === "phase" ? `Phase ${event.phaseId}` : "Workflow";
    const status = event.passed ? "passed" : "failed";
    this.write(
      `${prefix()} ${label} acceptance ${status} (${event.attempts} attempt(s))`,
    );
  }

  heartbeat(event: HeartbeatEvent): void {
    this.write(
      `${prefix()} Still running phase ${event.phaseId} (${event.agentId}) … ${formatDuration(event.elapsedMs)} elapsed`,
    );
  }

  workflowFinished(event: WorkflowFinishedEvent): void {
    const duration = formatDuration(event.durationMs);
    this.write(
      `${prefix()} Run ${event.runId} ${event.status} (${duration}) — ${event.message}`,
    );
  }
}

export function startHeartbeat(
  onTick: (elapsedMs: number) => void,
  intervalMs = 15_000,
): () => void {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    onTick(Date.now() - startedAt);
  }, intervalMs);

  return () => clearInterval(timer);
}
