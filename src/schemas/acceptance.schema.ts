import { z } from "zod";

export const acceptanceCheckTypeSchema = z.enum([
  "command",
  "file_exists",
  "file_contains",
  "json_shape",
  "markdown_artifact",
  "agent_review",
  "test_result",
  "manual_approval",
]);

export type AcceptanceCheckType = z.infer<typeof acceptanceCheckTypeSchema>;

const baseCheckSchema = z.object({
  id: z.string(),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

export const acceptanceCheckSchema = z.discriminatedUnion("type", [
  baseCheckSchema.extend({
    type: z.literal("command"),
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().positive().optional(),
  }),
  baseCheckSchema.extend({
    type: z.literal("file_exists"),
    path: z.string(),
  }),
  baseCheckSchema.extend({
    type: z.literal("file_contains"),
    path: z.string(),
    pattern: z.string(),
    flags: z.string().optional(),
  }),
  baseCheckSchema.extend({
    type: z.literal("json_shape"),
    path: z.string(),
    schema: z.record(z.unknown()),
  }),
  baseCheckSchema.extend({
    type: z.literal("markdown_artifact"),
    path: z.string(),
    minLength: z.number().nonnegative().optional(),
  }),
  baseCheckSchema.extend({
    type: z.literal("agent_review"),
    prompt: z.string(),
    agent: z.string().optional(),
  }),
  baseCheckSchema.extend({
    type: z.literal("test_result"),
    command: z.string(),
    parser: z.enum(["pester", "vitest", "jest", "generic"]).default("generic"),
    cwd: z.string().optional(),
  }),
  baseCheckSchema.extend({
    type: z.literal("manual_approval"),
    message: z.string().optional(),
  }),
]);

export type AcceptanceCheck = z.infer<typeof acceptanceCheckSchema>;

export const acceptanceConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  criteria: z.array(acceptanceCheckSchema).min(1),
  retryPhase: z.string().optional(),
});

export type AcceptanceConfig = z.infer<typeof acceptanceConfigSchema>;

export const acceptanceResultSchema = z.object({
  checkId: z.string(),
  type: acceptanceCheckTypeSchema,
  passed: z.boolean(),
  required: z.boolean(),
  message: z.string(),
  durationMs: z.number(),
  output: z.string().optional(),
});

export type AcceptanceResult = z.infer<typeof acceptanceResultSchema>;

export const acceptanceReportSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  attempt: z.number().int().nonnegative(),
  passed: z.boolean(),
  results: z.array(acceptanceResultSchema),
});

export type AcceptanceReport = z.infer<typeof acceptanceReportSchema>;
