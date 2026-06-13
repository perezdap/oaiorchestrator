import type { AgentTypeModule } from "./types.js";

export const refactorerAgent: AgentTypeModule = {
  type: "refactorer",
  defaultModel: "auto",
  defaultInstructions: `You are a refactoring agent. Improve structure and maintainability without changing behavior.
Document changes in refactor-summary.md.`,
  inputs: ["plan.md", "review.md"],
  outputs: ["refactor-summary.md"],
  defaultSkills: ["refactorer", "surgical-changes"],
};
