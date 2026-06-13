import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { AcceptanceReport } from "../schemas/acceptance.schema.js";
import { redactSecrets, redactSecretsDeep } from "../policies/redactionPolicy.js";
import { formatAcceptanceReportMarkdown } from "./RunReports.js";
import { RunRecord, type RunStateData } from "./RunRecord.js";
import type { Workflow } from "../schemas/workflow.schema.js";

/**
 * Run IDs become a directory name under `.runs/`. Reject anything that could
 * traverse out of that tree (path separators, `..`, drive letters). Generated
 * IDs are base36 + hyphen, so the safe charset is non-restrictive in practice.
 */
function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error(
      `Invalid run id "${runId}": only letters, digits, hyphen, and underscore are allowed`,
    );
  }
}

export class RunArchive {
  constructor(public readonly runDir: string) {}

  static findRunDir(cwd: string, runId: string): string {
    assertSafeRunId(runId);
    return join(cwd, ".runs", runId);
  }

  static createNew(
    runId: string,
    workflow: Workflow,
    cwd: string,
    inputs: Record<string, unknown>,
  ): { archive: RunArchive; record: RunRecord } {
    const runDir = RunArchive.findRunDir(cwd, runId);
    mkdirSync(join(runDir, "agent-messages"), { recursive: true });
    mkdirSync(join(runDir, "artifacts"), { recursive: true });

    const archive = new RunArchive(runDir);
    const data = RunRecord.createInitialData(runId, workflow, cwd, inputs);
    const record = new RunRecord(data, archive);

    archive.persistWorkflow(workflow);
    archive.persistRequest(inputs);
    archive.save(record);

    return { archive, record };
  }

  static load(runDir: string): { archive: RunArchive; record: RunRecord } {
    const statePath = join(runDir, "state.json");
    if (!existsSync(statePath)) {
      throw new Error(`Run state not found: ${statePath}`);
    }
    const data = JSON.parse(readFileSync(statePath, "utf-8")) as RunStateData;
    const archive = new RunArchive(runDir);
    const record = new RunRecord(data, archive);
    return { archive, record };
  }

  save(record: RunRecord): void {
    const data = redactSecretsDeep(record.toJSON());
    writeFileSync(
      join(this.runDir, "state.json"),
      JSON.stringify(data, null, 2),
      "utf-8",
    );
  }

  appendPhaseLog(entry: string): void {
    const logPath = join(this.runDir, "phase-log.md");
    const line = `\n## ${new Date().toISOString()}\n${redactSecrets(entry)}\n`;
    if (existsSync(logPath)) {
      writeFileSync(logPath, readFileSync(logPath, "utf-8") + line, "utf-8");
    } else {
      writeFileSync(logPath, `# Phase Log\n${line}`, "utf-8");
    }
  }

  saveAgentMessage(phaseId: string, content: string): void {
    const path = join(this.runDir, "agent-messages", `${phaseId}.md`);
    writeFileSync(path, redactSecrets(content), "utf-8");
  }

  persistWorkflow(workflow: Workflow): void {
    // Agent instructions, acceptance commands, and input defaults can contain
    // secrets — redact the serialized snapshot like every other persisted file.
    writeFileSync(
      join(this.runDir, "workflow.yaml"),
      redactSecrets(stringifyYaml(workflow)),
      "utf-8",
    );
  }

  persistRequest(inputs: Record<string, unknown>): void {
    const redactedInputs = redactSecretsDeep(inputs);
    const task =
      typeof redactedInputs.task === "string"
        ? redactedInputs.task
        : JSON.stringify(redactedInputs, null, 2);
    writeFileSync(join(this.runDir, "request.md"), `# Request\n\n${task}\n`, "utf-8");
  }

  writeAcceptanceReport(report: AcceptanceReport): void {
    const redactedReport = redactSecretsDeep(report);
    writeFileSync(
      join(this.runDir, "acceptance-report.json"),
      JSON.stringify(redactedReport, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(this.runDir, "acceptance-report.md"),
      redactSecrets(formatAcceptanceReportMarkdown(redactedReport)),
      "utf-8",
    );
  }

  writeFinalReport(content: string): void {
    writeFileSync(join(this.runDir, "final-report.md"), redactSecrets(content), "utf-8");
  }
}
