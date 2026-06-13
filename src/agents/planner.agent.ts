import type { AgentTypeModule } from "./types.js";

export const plannerAgent: AgentTypeModule = {
  type: "planner",
  defaultModel: "auto",
  defaultInstructions: `You are a planning agent. Decompose the user's request into concrete phases, risks, assumptions, and acceptance criteria.
Produce a plan.md with numbered steps and an acceptance.md with verifiable criteria.
Be explicit about Windows-first tooling (PowerShell, Pester, winget, PSADT) when relevant.`,
  inputs: ["task", "repoPath"],
  outputs: ["plan.md", "acceptance.md"],
  defaultSkills: ["planner", "plan-structure", "windows-first"],
};
