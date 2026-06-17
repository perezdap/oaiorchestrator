import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiAgentRunner } from "../../runners/piAgentRunner.js";
import type { AgentRunInput } from "../../runners/types.js";
import { createTempCwd } from "../helpers/tempDirs.js";

function makeInput(cwd: string): AgentRunInput {
  return {
    agentId: "researcher",
    agentConfig: {
      type: "researcher",
      model: "auto",
      instructions: "Answer concisely.",
    },
    prompt: "Reply with the single word: pong",
    cwd,
    runId: "pi-sdk-test",
    phaseId: "ping",
    artifactsDir: join(cwd, "artifacts"),
  };
}

describe("Pi agent live integration", () => {
  it.skipIf(!process.env.OPENAI_API_KEY)(
    "PiAgentRunner completes a minimal prompt",
    async () => {
      const cwd = createTempCwd("pi-live-");
      const runner = new PiAgentRunner({
        apiKey: process.env.OPENAI_API_KEY,
        mcpConnectTimeoutMs: 60_000,
        timeoutMs: 120_000,
      });

      const result = await runner.run(makeInput(cwd));

      expect(result.success).toBe(true);
      expect(result.status).toBe("finished");
      expect(result.result?.toLowerCase()).toContain("pong");
    },
    180_000,
  );
});
