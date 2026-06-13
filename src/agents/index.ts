import { documenterAgent } from "./documenter.agent.js";
import { implementerAgent } from "./implementer.agent.js";
import { plannerAgent } from "./planner.agent.js";
import { refactorerAgent } from "./refactorer.agent.js";
import { releaseManagerAgent } from "./release-manager.agent.js";
import { researcherAgent } from "./researcher.agent.js";
import { reviewerAgent } from "./reviewer.agent.js";
import { securityReviewerAgent } from "./security-reviewer.agent.js";
import { testWriterAgent } from "./test-writer.agent.js";
import { toAgentDefinition, type AgentTypeModule } from "./types.js";
import { verifierAgent } from "./verifier.agent.js";

export const builtInAgentModules: AgentTypeModule[] = [
  plannerAgent,
  implementerAgent,
  reviewerAgent,
  verifierAgent,
  researcherAgent,
  documenterAgent,
  securityReviewerAgent,
  testWriterAgent,
  refactorerAgent,
  releaseManagerAgent,
];

export const builtInAgentDefinitions = builtInAgentModules.map(toAgentDefinition);

export {
  plannerAgent,
  implementerAgent,
  reviewerAgent,
  verifierAgent,
  researcherAgent,
  documenterAgent,
  securityReviewerAgent,
  testWriterAgent,
  refactorerAgent,
  releaseManagerAgent,
};
