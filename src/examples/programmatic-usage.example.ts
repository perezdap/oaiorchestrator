/**
 * Programmatic usage example — Orchestrator + MockAgentRunner (no API key needed).
 *
 * For real runs, swap MockAgentRunner for OpenAiChatRunner:
 *   const orchestrator = new Orchestrator({
 *     cwd: repoPath,
 *     agentRunner: new OpenAiChatRunner({ apiKey: process.env.OPENAI_API_KEY }),
 *   });
 *
 * Run from the repository root:
 *   npm run example:programmatic
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalPolicy,
  MockAgentRunner,
  NodeShellRunner,
  Orchestrator,
  parseWorkflowFile,
  type RunWorkflowResult,
} from "../index.js";

export interface ProgrammaticExampleSummary {
  status: RunWorkflowResult["status"];
  runId: string;
  runDir: string;
  repoPath: string;
  phasesCompleted: number;
  phasesTotal: number;
  acceptancePassed: boolean;
  planArtifactPath: string;
}

const exampleDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(exampleDir, "programmatic-usage.workflow.yaml");

export interface RunProgrammaticExampleOptions {
  cleanup?: boolean;
}

export async function runProgrammaticExample(
  options: RunProgrammaticExampleOptions = {},
): Promise<ProgrammaticExampleSummary> {
  const repoPath = mkdtempSync(join(tmpdir(), "orchestrator-programmatic-example-"));

  try {
    const workflow = parseWorkflowFile(workflowPath);
    const mockRunner = new MockAgentRunner();

    for (const phase of workflow.phases) {
      mockRunner.setResponse(phase.id, {
        phaseId: phase.id,
        result: `Mock completed phase "${phase.id}"`,
        success: true,
        artifacts:
          phase.id === "plan"
            ? { "plan.md": "# Plan\n\nExample plan written by MockAgentRunner." }
            : undefined,
      });
    }

    const orchestrator = new Orchestrator({
      cwd: repoPath,
      agentRunner: mockRunner,
      approvalPolicy: new ApprovalPolicy({
        autoApproveInTests: true,
        autoApproveManualChecks: true,
      }),
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: {
        task: "Demonstrate library-mode orchestration",
        repoPath,
      },
    });

    const planArtifactPath = join(result.runDir, "artifacts", "plan.md");
    if (!existsSync(planArtifactPath)) {
      throw new Error(`Expected plan artifact at ${planArtifactPath}`);
    }

    return {
      status: result.status,
      runId: result.runId,
      runDir: result.runDir,
      repoPath,
      phasesCompleted: result.phasesCompleted,
      phasesTotal: result.phasesTotal,
      acceptancePassed: result.acceptancePassed,
      planArtifactPath,
    };
  } finally {
    if (options.cleanup) {
      rmSync(repoPath, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log("Running programmatic usage example...\n");

  const summary = await runProgrammaticExample({ cleanup: false });
  const finalReportPath = join(summary.runDir, "final-report.md");
  const acceptanceReportPath = join(summary.runDir, "acceptance-report.json");

  console.log("Run summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (existsSync(finalReportPath)) {
    console.log("\nFinal report:\n");
    console.log(readFileSync(finalReportPath, "utf-8"));
  }

  if (existsSync(acceptanceReportPath)) {
    const acceptanceReport = JSON.parse(readFileSync(acceptanceReportPath, "utf-8")) as {
      passed: boolean;
    };
    console.log(`Acceptance passed: ${acceptanceReport.passed}`);
  }

  rmSync(summary.repoPath, { recursive: true, force: true });

  if (summary.status !== "completed" || !summary.acceptancePassed) {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
