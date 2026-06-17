import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunInput } from "../runners/types.js";
import { createTempCwd } from "./helpers/tempDirs.js";

const { mockDispose, mockCreateMcpClientManager } = vi.hoisted(() => ({
  mockDispose: vi.fn(),
  mockCreateMcpClientManager: vi.fn(),
}));

vi.mock("../runners/mcpClientManager.js", () => ({
  createMcpClientManager: (...args: unknown[]) => mockCreateMcpClientManager(...args),
}));

import { PiAgentRunner } from "../runners/piAgentRunner.js";

afterEach(() => {
  vi.unstubAllEnvs();
  mockDispose.mockReset();
  mockCreateMcpClientManager.mockReset();
  mockDispose.mockResolvedValue(undefined);
});

beforeEach(() => {
  mockCreateMcpClientManager.mockResolvedValue({
    tools: [],
    toolNames: [],
    warnings: [],
    dispose: mockDispose,
  });
});

function makeInput(cwd: string, overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    agentId: "implementer",
    agentConfig: {
      type: "implementer",
      model: "auto",
      instructions: "Implement the task.",
    },
    prompt: "Do the work.",
    cwd,
    runId: "pi-runner-test",
    phaseId: "phase-1",
    artifactsDir: join(cwd, "artifacts"),
    ...overrides,
  };
}

describe("PiAgentRunner", () => {
  it("fails fast without an API key and disposes MCP connections", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const cwd = createTempCwd("pi-runner-");
    const runner = new PiAgentRunner({
      mcpServers: [{ name: "demo", transport: "stdio", command: "npx" }],
    });

    const result = await runner.run(makeInput(cwd));

    expect(result.success).toBe(false);
    expect(result.error).toContain("OPENAI_API_KEY");
    expect(mockCreateMcpClientManager).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it("forwards MCP warnings through onWarning", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const cwd = createTempCwd("pi-runner-");
    const warnings: string[] = [];
    mockCreateMcpClientManager.mockImplementation(async (_servers, options) => {
      options?.onWarning?.('MCP server "demo": offline');
      return {
        tools: [],
        toolNames: [],
        warnings: ['MCP server "demo": offline'],
        dispose: mockDispose,
      };
    });

    const runner = new PiAgentRunner({
      mcpServers: [{ name: "demo", transport: "stdio", command: "npx" }],
      onWarning: (message) => warnings.push(message),
    });

    await runner.run(makeInput(cwd));

    expect(warnings).toContain('MCP server "demo": offline');
  });

  it("merges runner-level and per-agent MCP server configs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const cwd = createTempCwd("pi-runner-");
    const runner = new PiAgentRunner({
      mcpServers: [{ name: "global", transport: "stdio", command: "npx" }],
    });

    await runner.run(
      makeInput(cwd, {
        agentConfig: {
          type: "implementer",
          model: "auto",
          instructions: "Implement the task.",
          mcpServers: [
            {
              name: "agent",
              transport: "http",
              url: "http://localhost:3000/mcp",
            },
          ],
        },
      }),
    );

    expect(mockCreateMcpClientManager).toHaveBeenCalledWith(
      [
        { name: "global", transport: "stdio", command: "npx" },
        {
          name: "agent",
          transport: "http",
          url: "http://localhost:3000/mcp",
        },
      ],
      expect.objectContaining({ workspaceRoot: cwd }),
    );
  });
});
