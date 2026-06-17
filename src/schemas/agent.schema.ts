import { z } from "zod";
import { mcpServerReferenceSchema } from "./mcpAllowlist.js";

export const agentTypeSchema = z.enum([
  "planner",
  "implementer",
  "reviewer",
  "verifier",
  "researcher",
  "documenter",
  "security-reviewer",
  "test-writer",
  "refactorer",
  "release-manager",
]);

export type AgentType = z.infer<typeof agentTypeSchema>;

export const agentConfigSchema = z.object({
  type: agentTypeSchema,
  model: z.string().default("auto"),
  baseUrl: z.string().url().optional(),
  instructions: z.string(),
  allowedTools: z.array(z.string()).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(mcpServerReferenceSchema).optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const agentDefinitionSchema = agentConfigSchema.extend({
  id: z.string(),
  defaultInstructions: z.string().optional(),
});

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
