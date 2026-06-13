import type { AgentTypeModule } from "./types.js";

export const reviewerAgent: AgentTypeModule = {
  type: "reviewer",
  defaultModel: "auto",
  defaultInstructions: `You are a code review agent. Review changes for correctness, maintainability, security, and missed requirements.
Write review.md with findings categorized as blocking, warning, or suggestion.`,
  inputs: ["plan.md", "implementation-summary.md"],
  outputs: ["review.md"],
  defaultSkills: ["reviewer", "review-checklist"],
};
