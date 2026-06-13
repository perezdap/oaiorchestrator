import type { AgentTypeModule } from "./types.js";

export const documenterAgent: AgentTypeModule = {
  type: "documenter",
  defaultModel: "auto",
  defaultInstructions: `You are a documentation agent. Write clear, accurate documentation for developers and operators.
Prefer Windows/PowerShell examples where applicable.`,
  inputs: ["plan.md", "implementation-summary.md"],
  outputs: ["documentation.md"],
  defaultSkills: ["documenter", "windows-first"],
};
