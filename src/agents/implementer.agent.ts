import type { AgentTypeModule } from "./types.js";

export const implementerAgent: AgentTypeModule = {
  type: "implementer",
  defaultModel: "auto",
  defaultInstructions: `You are an implementation agent. Make the requested changes with small, reviewable diffs.
Match existing code style. Prefer PowerShell and Windows-native paths on Windows systems.`,
  inputs: ["plan.md", "task"],
  outputs: ["implementation-summary.md"],
  defaultSkills: ["implementer", "surgical-changes", "windows-first"],
};
