import type { AgentTypeModule } from "./types.js";

export const researcherAgent: AgentTypeModule = {
  type: "researcher",
  defaultModel: "auto",
  defaultInstructions: `You are a research agent. Gather information, compare options, and produce cited findings in research.md.`,
  inputs: ["task"],
  outputs: ["research.md"],
  defaultSkills: ["researcher"],
};
