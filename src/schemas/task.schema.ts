import { z } from "zod";
import { acceptanceCheckSchema } from "./acceptance.schema.js";

export const phaseFailureBehaviorSchema = z.enum([
  "stop",
  "skip",
  "retry",
  "continue",
]);

export type PhaseFailureBehavior = z.infer<typeof phaseFailureBehaviorSchema>;

export const phaseSchema = z.object({
  // Phase ids become filename segments under .runs/<run-id>/ (agent-messages,
  // artifacts), so restrict them to a safe identifier charset.
  id: z
    .string()
    .min(1)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Phase id may only contain letters, digits, hyphen, and underscore",
    ),
  agent: z.string().min(1),
  objective: z.string(),
  context: z.record(z.string()).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  requiredArtifacts: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).default([]),
  skills: z.array(z.string()).optional(),
  acceptance: z.array(acceptanceCheckSchema).optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  onFailure: phaseFailureBehaviorSchema.optional(),
});

export type Phase = z.infer<typeof phaseSchema>;

export const taskInputSchema = z.object({
  task: z.string().optional(),
  repoPath: z.string().optional(),
}).passthrough();

export type TaskInput = z.infer<typeof taskInputSchema>;

export const phaseStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "retrying",
]);

export type PhaseStatus = z.infer<typeof phaseStatusSchema>;

export const phaseRunRecordSchema = z.object({
  phaseId: z.string(),
  status: phaseStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  agentId: z.string().optional(),
  runId: z.string().optional(),
  error: z.string().optional(),
  artifacts: z.array(z.string()).default([]),
});

export type PhaseRunRecord = z.infer<typeof phaseRunRecordSchema>;
