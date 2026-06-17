import { describe, expect, it } from "vitest";
import { createMcpClientManager } from "../../runners/mcpClientManager.js";

describe("MCP live integration", () => {
  it(
    "discovers tools and schemas from server-everything",
    async () => {
      const manager = await createMcpClientManager(
        [
          {
            name: "everything",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-everything"],
          },
        ],
        { connectTimeoutMs: 60_000 },
      );

      try {
        expect(manager.toolNames.length).toBeGreaterThan(0);
        expect(manager.tools[0]?.parameters).toBeTruthy();
        expect(manager.tools[0]?.description.length).toBeGreaterThan(0);
      } finally {
        await manager.dispose();
      }
    },
    120_000,
  );
});
