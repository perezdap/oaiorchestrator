import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhaseInputArtifacts,
  buildPhasePromptBody,
  composeAgentPrompt,
} from "../runners/composeAgentPrompt.js";
import { PromptComposer } from "../runners/PromptComposer.js";
import { createTempCwd } from "./helpers/tempDirs.js";

describe("PromptComposer", () => {
  it("matches buildPhasePromptBody + composeAgentPrompt for phase runs", () => {
    const composer = new PromptComposer();
    const artifactsDir = "C:\\repo\\.runs\\run-1\\artifacts";
    const taskContext = { task: "Add login" };
    const agentConfig = {
      type: "implementer" as const,
      model: "auto" as const,
      instructions: "Implement the plan.",
      skills: ["implementer"],
    };
    const phase = {
      id: "build",
      objective: "Implement feature",
      inputs: ["plan.md"],
      outputs: ["summary.md"],
      context: { priority: "high" },
    };
    const skills = [
      {
        id: "implementer",
        name: "implementer",
        body: "Follow the plan exactly.",
        source: "framework" as const,
      },
    ];

    const composed = composer.composePhasePrompt({
      phase,
      agentConfig,
      taskContext,
      artifactsDir,
      cwd: "C:\\repo",
      skills,
    });

    const body = buildPhasePromptBody({
      objective: phase.objective,
      task: taskContext.task,
      inputArtifacts: buildPhaseInputArtifacts(artifactsDir, phase.inputs),
      outputArtifacts: phase.outputs,
    });

    const expected = composeAgentPrompt({
      agentId: agentConfig.type,
      agentConfig,
      prompt: body,
      cwd: "C:\\repo",
      runId: "",
      phaseId: phase.id,
      artifactsDir,
      context: { ...taskContext, ...phase.context },
      skills,
    });

    expect(composed).toBe(expected);
    expect(composed).toContain("# Agent Role: implementer");
    expect(composed).toContain("Implement feature");
    expect(composed).toContain("plan.md");
    expect(composed).toContain("summary.md");
    expect(composed).toContain("priority: high");
    expect(composed).toContain("Follow the plan exactly.");
  });

  it("falls back to the agent's default inputs and excludes context keys", () => {
    const cwd = createTempCwd("prompt-composer-");
    const artifactsDir = join(cwd, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, "plan.md"), "# Plan\nDo the thing.", "utf-8");

    const composer = new PromptComposer();
    const composed = composer.composePhasePrompt({
      // implementer's default inputs are ["plan.md", "task"]
      phase: { id: "implement", objective: "Build it" },
      agentConfig: {
        type: "implementer",
        model: "auto",
        instructions: "Implement the plan.",
        inputs: ["plan.md", "task"],
      },
      taskContext: { task: "Ship the feature" },
      artifactsDir,
      cwd,
    });

    // plan.md content embedded for the file-less chat model
    expect(composed).toContain("### Input artifact: plan.md");
    expect(composed).toContain("Do the thing.");
    // "task" is a context key, not embedded as an artifact block
    expect(composed).not.toContain("### Input artifact: task");
    // but the task still reaches the model via the context section
    expect(composed).toContain("task: Ship the feature");
  });
});
