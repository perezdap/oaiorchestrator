#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { builtInAgentDefinitions } from "./agents/index.js";
import { formatInitSummary, initProject } from "./init/initProject.js";
import { Orchestrator } from "./orchestrator/Orchestrator.js";
import { ConsoleRunProgress, noopRunProgress } from "./orchestrator/RunProgress.js";
import { RunState } from "./orchestrator/RunState.js";
import { parseWorkflowFile } from "./schemas/workflow.schema.js";

function readPackageVersion(): string {
  // package.json sits one level above both dist/ and src/.
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  try {
    return (JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("oaiorchestrator")
  .description("OpenAI-compatible agent orchestration framework")
  .version(readPackageVersion());

program
  .command("run")
  .description("Run a workflow")
  .requiredOption("-w, --workflow <path>", "Path to workflow YAML/JSON file")
  .option("-t, --task <task>", "Task description")
  .option("-r, --repo-path <path>", "Repository/workspace path", process.cwd())
  .option("--run-id <id>", "Custom run ID")
  .option("--dry-run", "Validate and simulate without calling agents", false)
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (opts: {
    workflow: string;
    task?: string;
    repoPath: string;
    runId?: string;
    dryRun: boolean;
    quiet: boolean;
  }) => {
    const workflowPath = resolve(opts.workflow);
    if (!existsSync(workflowPath)) {
      console.error(`Workflow not found: ${workflowPath}`);
      process.exit(1);
    }

    const repoPath = resolve(opts.repoPath);

    const workflow = parseWorkflowFile(workflowPath, { workspaceRoot: repoPath });
    const orchestrator = new Orchestrator({
      cwd: repoPath,
      dryRun: opts.dryRun,
      progress: opts.quiet ? noopRunProgress : new ConsoleRunProgress(),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: {
        task: opts.task,
        repoPath,
      },
      runId: opts.runId,
    });

    console.log(`Run ID: ${result.runId}`);
    console.log(`Run directory: ${result.runDir}`);
    console.log(`Status: ${result.status}`);
    console.log(`Acceptance: ${result.acceptancePassed ? "passed" : "failed"}`);
    console.log(`Phases: ${result.phasesCompleted}/${result.phasesTotal}`);
    console.log(result.message);

    process.exit(result.status === "completed" ? 0 : 1);
  });

program
  .command("resume")
  .description("Resume a previous run")
  .requiredOption("--run-id <id>", "Run ID to resume")
  .option("-w, --workflow <path>", "Path to workflow file (optional if stored in run)")
  .option("-r, --repo-path <path>", "Repository path", process.cwd())
  .option("-q, --quiet", "Suppress progress output", false)
  .action(async (opts: { runId: string; workflow?: string; repoPath: string; quiet: boolean }) => {
    const cwd = resolve(opts.repoPath);
    const runDir = RunState.findRunDir(cwd, opts.runId);

    if (!existsSync(runDir)) {
      console.error(`Run not found: ${runDir}`);
      process.exit(1);
    }

    let workflow;
    if (opts.workflow) {
      workflow = parseWorkflowFile(resolve(opts.workflow), { workspaceRoot: cwd });
    } else {
      const workflowPath = join(runDir, "workflow.yaml");
      if (!existsSync(workflowPath)) {
        console.error(`Workflow not found in run directory: ${workflowPath}`);
        process.exit(1);
      }
      workflow = parseWorkflowFile(workflowPath, { workspaceRoot: cwd });
    }

    const state = RunState.load(runDir);
    const orchestrator = new Orchestrator({
      cwd,
      progress: opts.quiet ? noopRunProgress : new ConsoleRunProgress(),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: state.toJSON().inputs,
      runId: opts.runId,
      resume: true,
    });

    console.log(`Resumed run ${result.runId}: ${result.status}`);
    process.exit(result.status === "completed" ? 0 : 1);
  });

program
  .command("validate")
  .description("Validate a workflow file")
  .requiredOption("-w, --workflow <path>", "Path to workflow YAML/JSON file")
  .action((opts: { workflow: string }) => {
    const workflowPath = resolve(opts.workflow);
    try {
      const workflow = parseWorkflowFile(workflowPath, { workspaceRoot: process.cwd() });
      console.log(`Valid workflow: ${workflow.name}`);
      console.log(`  Phases: ${workflow.phases.length}`);
      console.log(`  Agents: ${Object.keys(workflow.agents).length}`);
      if (workflow.acceptance) {
        console.log(`  Acceptance criteria: ${workflow.acceptance.criteria.length}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("list-agents")
  .description("List built-in agent types")
  .action(() => {
    console.log("Built-in agent types:\n");
    for (const agent of builtInAgentDefinitions) {
      console.log(`  ${agent.type}`);
      console.log(`    Model: ${agent.model}`);
      console.log(`    Outputs: ${agent.outputs?.join(", ") ?? "(none)"}`);
      console.log("");
    }
  });

program
  .command("init")
  .description("Initialize orchestrator config in the current directory")
  .action(() => {
    const result = initProject(process.cwd(), import.meta.url);
    console.log(formatInitSummary(result));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
