import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhaseInputArtifacts,
  buildPhasePromptBody,
  composeAgentPrompt,
} from "../runners/composeAgentPrompt.js";
import type { AgentRunInput } from "../runners/types.js";
import { createTempCwd } from "./helpers/tempDirs.js";

describe("composeAgentPrompt", () => {
  it("wraps phase content with role, instructions, context, and artifacts dir", () => {
    const input: AgentRunInput = {
      agentId: "planner",
      agentConfig: {
        type: "planner",
        model: "auto",
        instructions: "Plan the work.",
      },
      prompt: "Understand the task.",
      cwd: "C:\\repo",
      executionMode: "local",
      runId: "run-1",
      phaseId: "intake",
      artifactsDir: "C:\\repo\\.runs\\run-1\\artifacts",
      context: { task: "Add tests" },
    };

    const prompt = composeAgentPrompt(input);

    expect(prompt).toContain("# Agent Role: planner");
    expect(prompt).toContain("Plan the work.");
    expect(prompt).toContain("## Phase: intake");
    expect(prompt).toContain("Understand the task.");
    expect(prompt).toContain("task: Add tests");
    expect(prompt).toContain("Artifacts directory:");
  });

  it("includes resolved skills in the prompt", () => {
    const input: AgentRunInput = {
      agentId: "planner",
      agentConfig: {
        type: "planner",
        model: "auto",
        instructions: "Plan the work.",
      },
      prompt: "Understand the task.",
      cwd: "C:\\repo",
      executionMode: "local",
      runId: "run-1",
      phaseId: "intake",
      artifactsDir: "C:\\repo\\.runs\\run-1\\artifacts",
      skills: [
        {
          id: "planner",
          name: "planner",
          body: "Write plan.md and acceptance.md.",
          source: "framework",
        },
      ],
    };

    const prompt = composeAgentPrompt(input);

    expect(prompt).toContain("## Skills");
    expect(prompt).toContain("### planner");
    expect(prompt).toContain("Write plan.md and acceptance.md.");
  });
});

describe("buildPhasePromptBody", () => {
  it("includes objective, task, inputs, and outputs", () => {
    const body = buildPhasePromptBody({
      objective: "Implement feature",
      task: "Add login",
      inputArtifacts: [{ name: "plan.md", path: "C:\\artifacts\\plan.md" }],
      outputArtifacts: ["summary.md"],
    });

    expect(body).toContain("Implement feature");
    expect(body).toContain("Add login");
    expect(body).toContain("plan.md");
    expect(body).toContain("summary.md");
  });

  it("embeds input artifact content so a chat model can read prior outputs", () => {
    const body = buildPhasePromptBody({
      objective: "Implement feature",
      inputArtifacts: [
        { name: "plan.md", path: "C:\\artifacts\\plan.md", content: "# Plan\nStep one." },
      ],
    });

    expect(body).toContain("### Input artifact: plan.md");
    expect(body).toContain("# Plan\nStep one.");
  });
});

describe("buildPhaseInputArtifacts", () => {
  it("reads artifact contents from disk and marks oversized ones truncated", () => {
    const dir = createTempCwd("input-artifacts-");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan.md"), "# Plan\nDetails.", "utf-8");
    writeFileSync(join(dir, "big.txt"), "x".repeat(20_000), "utf-8");

    const artifacts = buildPhaseInputArtifacts(dir, ["plan.md", "big.txt", "missing.md"]);

    expect(artifacts).toBeDefined();
    const plan = artifacts?.find((a) => a.name === "plan.md");
    expect(plan?.content).toBe("# Plan\nDetails.");
    expect(plan?.truncated).toBe(false);

    const big = artifacts?.find((a) => a.name === "big.txt");
    expect(big?.truncated).toBe(true);
    expect(big?.content?.length).toBe(16_000);

    const missing = artifacts?.find((a) => a.name === "missing.md");
    expect(missing?.content).toBeUndefined();
  });

  it("does not read input names that escape the artifacts directory", () => {
    const cwd = createTempCwd("input-artifacts-escape-");
    const artifactsDir = join(cwd, ".runs", "r1", "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    // A sensitive file in the workspace root, outside artifactsDir.
    writeFileSync(join(cwd, ".env"), "OPENAI_API_KEY=sk-secret", "utf-8");

    const artifacts = buildPhaseInputArtifacts(artifactsDir, ["../../../.env"]);

    const escaped = artifacts?.[0];
    expect(escaped?.content).toBeUndefined();
  });
});
