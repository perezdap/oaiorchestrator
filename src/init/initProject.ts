import { basename, dirname, join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolveExamplesDir } from "./resolveExamplesDir.js";

const STARTER_WORKFLOWS = ["generic-task.workflow.yaml"] as const;

const CONFIG_CONTENT = [
  "# oaiorchestrator configuration",
  "defaultExecutionMode: local",
  "runsDirectory: .runs",
  "",
  "# Set OPENAI_API_KEY in your environment for the OpenAI-compatible runner",
  "# Optional: OPENAI_BASE_URL to target Azure OpenAI, xAI/Grok, or a custom gateway",
].join("\n");

const ORCHESTRATOR_README = `# .orchestrator

Local configuration for [oaiorchestrator](https://github.com/perezdap/oaiorchestrator).

## Layout

\`\`\`text
<project-root>/
  .orchestrator/
    config.yaml       # Defaults for this repo (this folder)
    README.md         # This file
  workflows/          # Your workflow YAML files
  .runs/              # Run artifacts (gitignore this)
\`\`\`

\`oaiorchestrator init\` must be run from the **repository root**, not from inside \`.orchestrator/\`.

This package intentionally exposes the \`oaiorchestrator\` command instead of \`orchestrator\` to avoid collisions with older CursorOrchestrator local links.

## config.yaml

| Setting | Description |
|---------|-------------|
| \`defaultExecutionMode\` | \`local\` or \`cloud\` (currently both use the OpenAI-compatible runner) |
| \`runsDirectory\` | Where run output is stored (default \`.runs\`) |

## Next steps

\`\`\`powershell
oaiorchestrator validate --workflow .\\workflows\\generic-task.workflow.yaml

oaiorchestrator run \`
  --workflow .\\workflows\\generic-task.workflow.yaml \`
  --task "Your task" \`
  --repo-path .
\`\`\`

See \`workflows/generic-task.workflow.yaml\` for the starter template copied during init. To add more workflows, copy that file and edit it, or see the [workflows guide](https://github.com/perezdap/oaiorchestrator/blob/main/docs/workflows.md).
`;

export interface InitProjectResult {
  projectRoot: string;
  adjustedFromOrchestratorDir: boolean;
  created: string[];
  skipped: string[];
}

function resolveProjectRoot(cwd: string): { projectRoot: string; adjustedFromOrchestratorDir: boolean } {
  if (basename(cwd) === ".orchestrator") {
    return { projectRoot: dirname(cwd), adjustedFromOrchestratorDir: true };
  }

  return { projectRoot: cwd, adjustedFromOrchestratorDir: false };
}

function toDisplayPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function writeIfMissing(relativePath: string, content: string, projectRoot: string, result: InitProjectResult): void {
  const absolutePath = join(projectRoot, relativePath);
  if (existsSync(absolutePath)) {
    result.skipped.push(toDisplayPath(relativePath));
    return;
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
  result.created.push(toDisplayPath(relativePath));
}

function copyIfMissing(
  relativePath: string,
  sourcePath: string,
  projectRoot: string,
  result: InitProjectResult,
): void {
  const absolutePath = join(projectRoot, relativePath);
  if (existsSync(absolutePath)) {
    result.skipped.push(toDisplayPath(relativePath));
    return;
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  copyFileSync(sourcePath, absolutePath);
  result.created.push(toDisplayPath(relativePath));
}

export function initProject(cwd: string, moduleUrl: string): InitProjectResult {
  const { projectRoot, adjustedFromOrchestratorDir } = resolveProjectRoot(cwd);
  const examplesDir = resolveExamplesDir(moduleUrl);
  const result: InitProjectResult = {
    projectRoot,
    adjustedFromOrchestratorDir,
    created: [],
    skipped: [],
  };

  writeIfMissing(".orchestrator/config.yaml", CONFIG_CONTENT, projectRoot, result);
  writeIfMissing(".orchestrator/README.md", ORCHESTRATOR_README, projectRoot, result);

  mkdirSync(join(projectRoot, "workflows"), { recursive: true });
  mkdirSync(join(projectRoot, ".runs"), { recursive: true });

  for (const workflowFile of STARTER_WORKFLOWS) {
    copyIfMissing(
      join("workflows", workflowFile),
      join(examplesDir, workflowFile),
      projectRoot,
      result,
    );
  }

  return result;
}

export function formatInitSummary(result: InitProjectResult): string {
  const lines: string[] = [];

  if (result.adjustedFromOrchestratorDir) {
    lines.push("Note: init was run from .orchestrator/. Using repository root instead.");
    lines.push(`  Project root: ${result.projectRoot}`);
    lines.push("");
  }

  if (result.created.length > 0) {
    lines.push("Created:");
    for (const path of result.created) {
      lines.push(`  ${path}`);
    }
    lines.push("");
  }

  if (result.skipped.length > 0) {
    lines.push("Already present (skipped):");
    for (const path of result.skipped) {
      lines.push(`  ${path}`);
    }
    lines.push("");
  }

  lines.push("Project layout:");
  lines.push("  .orchestrator/config.yaml   Orchestrator settings");
  lines.push("  .orchestrator/README.md     Layout and next steps");
  lines.push("  workflows/                  Starter workflow template");
  lines.push("  .runs/                      Run artifacts (gitignore recommended)");
  lines.push("");
  lines.push("Next steps:");
  lines.push("  oaiorchestrator validate --workflow .\\workflows\\generic-task.workflow.yaml");
  lines.push('  oaiorchestrator run --workflow .\\workflows\\generic-task.workflow.yaml --task "Your task" --repo-path .');
  lines.push("");
  lines.push("Optional dry run (no OpenAI API calls):");
  lines.push('  oaiorchestrator run --workflow .\\workflows\\generic-task.workflow.yaml --task "Your task" --repo-path . --dry-run');

  return lines.join("\n");
}
