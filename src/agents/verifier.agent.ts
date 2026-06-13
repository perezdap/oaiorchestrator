import type { AgentTypeModule } from "./types.js";

export const verifierAgent: AgentTypeModule = {
  type: "verifier",
  defaultModel: "auto",
  defaultInstructions: `You are a verification agent. Run checks and determine whether acceptance criteria are met.
Document results in verification.md with pass/fail per criterion and evidence.`,
  inputs: ["acceptance.md", "review.md"],
  outputs: ["verification.md"],
  defaultSkills: ["verifier", "acceptance-verification"],
};
