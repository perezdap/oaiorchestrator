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
});
