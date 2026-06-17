import { describe, expect, it } from "vitest";
import {
  collectWorkflowMcpValidationIssues,
  mcpServerConfigsMatch,
  resolveMcpServerReferences,
} from "../schemas/mcpAllowlist.js";
import type { McpServerConfig } from "../schemas/mcp.schema.js";

const docsServer: McpServerConfig = {
  name: "docs",
  transport: "http",
  url: "http://localhost:3000/mcp",
};

const githubServer: McpServerConfig = {
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
};

describe("mcp allowlist", () => {
  it("matches equivalent stdio and http configs", () => {
    expect(mcpServerConfigsMatch(githubServer, { ...githubServer })).toBe(true);
    expect(mcpServerConfigsMatch(docsServer, { ...docsServer })).toBe(true);
    expect(
      mcpServerConfigsMatch(githubServer, {
        ...githubServer,
        command: "node",
      }),
    ).toBe(false);
  });

  it("resolves string references from the workflow allowlist", () => {
    const resolved = resolveMcpServerReferences([docsServer], ["docs"]);
    expect(resolved).toEqual([docsServer]);
  });

  it("resolves inline configs that match the allowlist", () => {
    const resolved = resolveMcpServerReferences([docsServer], [docsServer]);
    expect(resolved).toEqual([docsServer]);
  });

  it("collects validation issues for missing allowlists and unknown refs", () => {
    const issues = collectWorkflowMcpValidationIssues({
      agents: {
        researcher: {
          mcpServers: ["docs"],
        },
      },
    });

    expect(issues.some((issue) => issue.includes("missing a root-level mcpServers allowlist"))).toBe(
      true,
    );
    expect(issues.some((issue) => issue.includes('unknown MCP server "docs"'))).toBe(true);
  });
});
