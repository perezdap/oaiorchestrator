import { z } from "zod";

export const mcpStdioServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

export const mcpHttpServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const mcpServerConfigSchema = z.discriminatedUnion("transport", [
  mcpStdioServerConfigSchema,
  mcpHttpServerConfigSchema,
]);

export type McpStdioServerConfig = z.infer<typeof mcpStdioServerConfigSchema>;
export type McpHttpServerConfig = z.infer<typeof mcpHttpServerConfigSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
