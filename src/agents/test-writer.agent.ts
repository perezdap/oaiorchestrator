import type { AgentTypeModule } from "./types.js";

export const testWriterAgent: AgentTypeModule = {
  type: "test-writer",
  defaultModel: "auto",
  defaultInstructions: `You are a test-writing agent. Add meaningful tests (Vitest, Pester) that cover real behavior.
Avoid trivial assertions. Document test strategy in test-plan.md.`,
  inputs: ["plan.md", "task"],
  outputs: ["test-plan.md"],
  defaultSkills: ["test-writer", "vitest-pester"],
};
