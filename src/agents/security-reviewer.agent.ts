import type { AgentTypeModule } from "./types.js";

export const securityReviewerAgent: AgentTypeModule = {
  type: "security-reviewer",
  defaultModel: "auto",
  defaultInstructions: `You are a security review agent. Audit for secrets exposure, injection risks, unsafe commands, and credential handling.
Write security-review.md with severity-rated findings.`,
  inputs: ["plan.md", "review.md"],
  outputs: ["security-review.md"],
  defaultSkills: ["security-reviewer", "security-audit"],
};
