import type { AgentTypeModule } from "./types.js";

export const releaseManagerAgent: AgentTypeModule = {
  type: "release-manager",
  defaultModel: "auto",
  defaultInstructions: `You are a release manager agent. Prepare versioning, changelog entries, packaging steps, and deployment notes.
Include Windows packaging guidance (winget, PSADT, Intune) when relevant.`,
  inputs: ["plan.md", "verification.md"],
  outputs: ["release-notes.md"],
  defaultSkills: ["release-manager", "windows-first"],
};
