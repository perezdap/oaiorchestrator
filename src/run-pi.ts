/**
 * Pi-mode entry point for winget-intune-psadt-packager.
 *
 * Wires PiAgentRunner + SIHQ HTTP MCP server and runs a workflow
 * against a CSV of applications. Each app row goes through:
 *   1. research  — SIHQ MCP + winget bash calls
 *   2. build     — Build-CatalogueAppFolder.ps1 via bash
 *   3. security  — Authenticode + SHA256 verification
 *   4. quality   — final reviewer pass
 *
 * Usage (from repo root):
 *   npm --prefix Tools/oaiorchestrator run pi -- \
 *     --workflow workflows/winget-intune-pi.workflow.yaml \
 *     --task "Package apps from CSV/catalog.seed.csv" \
 *     --repo-path . \
 *     --sihq-url http://127.0.0.1:8010/mcp
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { Orchestrator } from "./orchestrator/Orchestrator.js";
import { ApprovalPolicy } from "./policies/approvalPolicy.js";
import { NodeShellRunner } from "./runners/shellRunner.js";
import { ConsoleRunProgress } from "./orchestrator/RunProgress.js";
import { parseWorkflowFile } from "./schemas/workflow.schema.js";
import { PiAgentRunner } from "./pi.js";
import type { McpServerConfig } from "./schemas/mcp.schema.js";

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseKeyValuePairs(pairs: string[], label: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) {
      throw new Error(`Invalid ${label} value "${pair}". Expected key=value.`);
    }
    result[pair.slice(0, eqIndex).trim()] = pair.slice(eqIndex + 1);
  }
  return result;
}

const program = new Command();

program
  .name("run-pi")
  .description("Pi-mode orchestrator runner with SIHQ MCP + winget tool access")
  .version(readPackageVersion())
  .requiredOption("-w, --workflow <path>", "Path to workflow YAML/JSON file")
  .option("-t, --task <task>", "Task description")
  .option("-r, --repo-path <path>", "Repository/workspace path", process.cwd())
  .option("--sihq-url <url>", "Silent Install HQ MCP server URL", "http://127.0.0.1:8010/mcp")
  .option("--input <key=value>", "Additional workflow input", collectOption, [])
  .option("--input-file <key=path>", "Additional workflow input loaded from a file", collectOption, [])
  .option("--run-id <id>", "Custom run ID")
  .option("--model <model>", "Model override (default: OPENAI_DEFAULT_MODEL or gpt-4o)")
  .option("--timeout-ms <ms>", "Per-agent session timeout in ms", "600000")
  .option("--dry-run", "Validate without calling agents", false)
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (opts: {
    workflow: string;
    task?: string;
    repoPath: string;
    sihqUrl: string;
    input: string[];
    inputFile: string[];
    runId?: string;
    model?: string;
    timeoutMs: string;
    dryRun: boolean;
    quiet: boolean;
  }) => {
    const workflowPath = resolve(opts.workflow);
    if (!existsSync(workflowPath)) {
      console.error(`Workflow not found: ${workflowPath}`);
      process.exitCode = 1;
      return;
    }

    const repoPath = resolve(opts.repoPath);
    const extraInputs = parseKeyValuePairs(opts.input ?? [], "--input");
    const fileInputs = parseKeyValuePairs(opts.inputFile ?? [], "--input-file");
    for (const [key, filePathValue] of Object.entries(fileInputs)) {
      const resolvedPath = resolve(filePathValue);
      if (!existsSync(resolvedPath)) {
        throw new Error(`Input file not found for ${key}: ${resolvedPath}`);
      }
      extraInputs[key] = readFileSync(resolvedPath, "utf-8");
    }

    const workflow = parseWorkflowFile(workflowPath, { workspaceRoot: repoPath });

    const sihqServer: McpServerConfig = {
      name: "silentinstallhq",
      transport: "http",
      url: opts.sihqUrl,
    };

    const timeoutMs = parseInt(opts.timeoutMs, 10) || 600_000;
    const model = opts.model ?? process.env.OPENAI_DEFAULT_MODEL ?? "gpt-4o";

    const runner = new PiAgentRunner({
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model,
      timeoutMs,
      mcpServers: [sihqServer],
    });

    const orchestrator = new Orchestrator({
      cwd: repoPath,
      agentRunner: runner,
      shellRunner: new NodeShellRunner({ enforcePolicy: true }),
      approvalPolicy: new ApprovalPolicy({ autoApproveManualChecks: true }),
      dryRun: opts.dryRun,
      progress: opts.quiet ? undefined : new ConsoleRunProgress(),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: {
        task: opts.task,
        repoPath,
        ...extraInputs,
      },
      runId: opts.runId,
    });

    // Print machine-readable summary to stdout
    console.log(JSON.stringify({
      runId: result.runId,
      status: result.status,
      runDir: result.runDir,
      acceptancePassed: result.acceptancePassed,
    }));

    if (result.status !== "completed" || !result.acceptancePassed) {
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
