import { z } from "zod";
import {
  mcpServerConfigSchema,
  type McpHttpServerConfig,
  type McpServerConfig,
  type McpStdioServerConfig,
} from "./mcp.schema.js";

export const mcpServerReferenceSchema = z.union([z.string().min(1), mcpServerConfigSchema]);

export type McpServerReference = z.infer<typeof mcpServerReferenceSchema>;

export const workflowMcpAllowlistSchema = z
  .array(mcpServerConfigSchema)
  .superRefine((servers, ctx) => {
    const seen = new Set<string>();
    for (const server of servers) {
      if (seen.has(server.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate MCP server name in workflow allowlist: ${server.name}`,
        });
        return;
      }
      seen.add(server.name);
    }
  });

export function mcpServerConfigsMatch(
  allowed: McpServerConfig,
  candidate: McpServerConfig,
): boolean {
  if (allowed.name !== candidate.name || allowed.transport !== candidate.transport) {
    return false;
  }

  if (allowed.transport === "stdio" && candidate.transport === "stdio") {
    return stdioConfigsMatch(allowed, candidate);
  }

  if (allowed.transport === "http" && candidate.transport === "http") {
    return httpConfigsMatch(allowed, candidate);
  }

  return false;
}

function stdioConfigsMatch(
  allowed: McpStdioServerConfig,
  candidate: McpStdioServerConfig,
): boolean {
  return (
    allowed.command === candidate.command &&
    arraysEqual(allowed.args, candidate.args) &&
    recordsEqual(allowed.env, candidate.env) &&
    (allowed.cwd ?? "") === (candidate.cwd ?? "")
  );
}

function httpConfigsMatch(
  allowed: McpHttpServerConfig,
  candidate: McpHttpServerConfig,
): boolean {
  return allowed.url === candidate.url && recordsEqual(allowed.headers, candidate.headers);
}

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function recordsEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

export function buildMcpAllowlistMap(
  allowlist: McpServerConfig[],
): Map<string, McpServerConfig> {
  return new Map(allowlist.map((server) => [server.name, server]));
}

export function resolveMcpServerReferences(
  allowlist: McpServerConfig[],
  references: McpServerReference[],
): McpServerConfig[] {
  const byName = buildMcpAllowlistMap(allowlist);

  return references.map((reference) => {
    if (typeof reference === "string") {
      const allowed = byName.get(reference);
      if (!allowed) {
        throw new Error(`Unknown MCP server reference "${reference}"`);
      }
      return allowed;
    }

    const allowed = byName.get(reference.name);
    if (!allowed) {
      throw new Error(`MCP server "${reference.name}" is not in the workflow allowlist`);
    }
    if (!mcpServerConfigsMatch(allowed, reference)) {
      throw new Error(
        `MCP server "${reference.name}" does not match the workflow allowlist entry`,
      );
    }
    return allowed;
  });
}

export interface WorkflowMcpValidationTarget {
  agents: Record<string, { mcpServers?: McpServerReference[] }>;
  mcpServers?: McpServerConfig[];
}

export function collectWorkflowMcpValidationIssues(
  workflow: WorkflowMcpValidationTarget,
): string[] {
  const allowlist = workflow.mcpServers ?? [];
  const byName = buildMcpAllowlistMap(allowlist);
  const issues: string[] = [];

  if (allowlist.length !== byName.size) {
    issues.push("Workflow MCP allowlist contains duplicate server names");
  }

  let anyAgentUsesMcp = false;

  for (const [agentId, agent] of Object.entries(workflow.agents)) {
    if (!agent.mcpServers?.length) {
      continue;
    }

    anyAgentUsesMcp = true;

    for (const reference of agent.mcpServers) {
      if (typeof reference === "string") {
        if (!byName.has(reference)) {
          issues.push(
            `Agent "${agentId}" references unknown MCP server "${reference}"`,
          );
        }
        continue;
      }

      const allowed = byName.get(reference.name);
      if (!allowed) {
        issues.push(
          `Agent "${agentId}" uses MCP server "${reference.name}" which is not in the workflow allowlist`,
        );
        continue;
      }

      if (!mcpServerConfigsMatch(allowed, reference)) {
        issues.push(
          `Agent "${agentId}" MCP server "${reference.name}" does not match the workflow allowlist entry`,
        );
      }
    }
  }

  if (anyAgentUsesMcp && allowlist.length === 0) {
    issues.push(
      "Workflow defines agent MCP servers but is missing a root-level mcpServers allowlist",
    );
  }

  return issues;
}
