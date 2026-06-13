import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AgentRunInput } from "./types.js";

export interface PhaseInputArtifact {
  name: string;
  path: string;
  content?: string;
  truncated?: boolean;
}

export interface PhasePromptBodyOptions {
  objective: string;
  task?: string;
  inputArtifacts?: PhaseInputArtifact[];
  outputArtifacts?: string[];
}

// The model cannot read files from the host, so input artifact contents are
// embedded in the prompt. Cap each artifact to keep prompts bounded.
const MAX_INPUT_ARTIFACT_CHARS = 16_000;

export function buildPhasePromptBody(options: PhasePromptBodyOptions): string {
  const parts = [options.objective, "", `Task: ${options.task ?? "(not specified)"}`];

  if (options.inputArtifacts?.length) {
    parts.push("", "Required inputs:");
    for (const input of options.inputArtifacts) {
      parts.push(`- ${input.name} (artifact path: ${input.path})`);
    }
    for (const input of options.inputArtifacts) {
      if (input.content === undefined) continue;
      parts.push("", `### Input artifact: ${input.name}`, "```", input.content, "```");
      if (input.truncated) {
        parts.push(`(truncated to the first ${MAX_INPUT_ARTIFACT_CHARS} characters)`);
      }
    }
  }

  if (options.outputArtifacts?.length) {
    parts.push("", "Expected outputs:");
    for (const output of options.outputArtifacts) {
      parts.push(`- ${output}`);
    }
  }

  return parts.join("\n");
}

export function composeAgentPrompt(input: AgentRunInput): string {
  const parts = [
    `# Agent Role: ${input.agentConfig.type}`,
    "",
    "## Instructions",
    input.agentConfig.instructions,
    "",
    `## Phase: ${input.phaseId}`,
    "## Objective",
    input.prompt,
  ];

  if (input.skills?.length) {
    parts.push("", "## Skills");
    for (const skill of input.skills) {
      parts.push("", `### ${skill.name}`, skill.body);
    }
  }

  if (input.context && Object.keys(input.context).length > 0) {
    parts.push("", "## Context");
    for (const [key, value] of Object.entries(input.context)) {
      parts.push(`${key}: ${value}`);
    }
  }

  parts.push("", `Artifacts directory: ${input.artifactsDir}`);
  parts.push(
    "",
    "## Verification contract",
    "The host verifies this phase with acceptance gates (shell commands, test parsers, file checks, manual approval).",
    "Propose actions and provide data for the host to verify; do not claim that commands were executed.",
    "Emit each expected output artifact as a fenced code block tagged with its filename, e.g. ```json name=plan.json",
  );
  return parts.join("\n");
}

export function buildPhaseInputArtifacts(
  artifactsDir: string,
  names?: string[],
): PhaseInputArtifact[] | undefined {
  if (!names?.length) return undefined;
  const root = resolve(artifactsDir);
  return names.map((name) => {
    const path = resolve(root, name);
    // Input names are workflow-supplied. Confine reads to the artifacts
    // directory so a name like "../../.env" cannot embed a workspace file
    // into the prompt. Anything that escapes is treated as not available.
    const rel = relative(root, path);
    const escapes = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    if (escapes || !existsSync(path)) {
      return { name, path };
    }
    const raw = readFileSync(path, "utf-8");
    const truncated = raw.length > MAX_INPUT_ARTIFACT_CHARS;
    return {
      name,
      path,
      content: truncated ? raw.slice(0, MAX_INPUT_ARTIFACT_CHARS) : raw,
      truncated,
    };
  });
}
