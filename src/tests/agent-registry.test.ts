import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../orchestrator/AgentRegistry.js";

describe("AgentRegistry", () => {
  it("preserves baseUrl from workflow agent config", () => {
    const registry = new AgentRegistry();
    registry.registerWorkflowAgents({
      researcher: {
        type: "researcher",
        model: "grok-3",
        baseUrl: "https://api.x.ai/v1",
        instructions: "Research things.",
      },
    });

    const resolved = registry.resolve("researcher");

    expect(resolved.baseUrl).toBe("https://api.x.ai/v1");
    expect(resolved.model).toBe("grok-3");
  });

  it("leaves baseUrl undefined when not configured", () => {
    const registry = new AgentRegistry();
    registry.registerWorkflowAgents({
      researcher: {
        type: "researcher",
        model: "auto",
        instructions: "Research things.",
      },
    });

    expect(registry.resolve("researcher").baseUrl).toBeUndefined();
  });

  it("resolves workflow MCP allowlist references for agents", () => {
    const registry = new AgentRegistry();
    registry.registerWorkflowMcpServers([
      {
        name: "docs",
        transport: "http",
        url: "http://localhost:3000/mcp",
      },
    ]);
    registry.registerWorkflowAgents({
      researcher: {
        type: "researcher",
        model: "auto",
        instructions: "Research things.",
        mcpServers: ["docs"],
      },
    });

    expect(registry.resolve("researcher").mcpServers).toEqual([
      {
        name: "docs",
        transport: "http",
        url: "http://localhost:3000/mcp",
      },
    ]);
  });
});
