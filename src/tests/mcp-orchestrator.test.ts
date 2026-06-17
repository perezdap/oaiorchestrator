import { describe, expect, it } from "vitest";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";
import { NodeShellRunner } from "../runners/shellRunner.js";
import type { AgentRunner, AgentRunInput } from "../runners/types.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";
import { createTempCwd } from "./helpers/tempDirs.js";

describe("MCP allowlist orchestrator integration", () => {
  it("resolves workflow MCP references before the agent runner executes", async () => {
    const workflow = validateWorkflow({
      name: "mcp-workflow",
      mcpServers: [
        {
          name: "docs",
          transport: "http",
          url: "http://localhost:3000/mcp",
        },
      ],
      agents: {
        researcher: {
          type: "researcher",
          model: "auto",
          instructions: "Research with MCP tools.",
          mcpServers: ["docs"],
        },
      },
      phases: [
        {
          id: "research",
          agent: "researcher",
          objective: "Research the task",
        },
      ],
    });

    const captured: AgentRunInput[] = [];
    const spyRunner: AgentRunner = {
      name: "spy",
      async run(input) {
        captured.push(input);
        return {
          success: true,
          status: "finished",
          result: "done",
          artifacts: [],
        };
      },
    };

    const cwd = createTempCwd("mcp-orchestrator-");
    const orchestrator = new Orchestrator({
      cwd,
      agentRunner: spyRunner,
      approvalPolicy: new ApprovalPolicy({
        autoApproveInTests: true,
        autoApproveManualChecks: true,
      }),
      shellRunner: new NodeShellRunner({ enforcePolicy: false }),
    });

    const result = await orchestrator.run({
      workflow,
      inputs: { task: "test", repoPath: cwd },
    });

    expect(result.status).toBe("completed");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.agentConfig.mcpServers).toEqual([
      {
        name: "docs",
        transport: "http",
        url: "http://localhost:3000/mcp",
      },
    ]);
  });
});
