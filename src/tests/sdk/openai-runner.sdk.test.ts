import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpenAiChatRunner } from "../../runners/openAiChatRunner.js";
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
    runId: "openai-sdk-test",
    phaseId: "ping",
    artifactsDir: join(cwd, "artifacts"),
  };
}

describe("OpenAI live integration", () => {
  it.skipIf(!process.env.OPENAI_API_KEY)(
    "OpenAiChatRunner completes a minimal prompt",
    async () => {
      const cwd = createTempCwd("openai-live-");
      const runner = new OpenAiChatRunner({ apiKey: process.env.OPENAI_API_KEY });

      const result = await runner.run(makeInput(cwd));

      expect(result.success).toBe(true);
      expect(result.status).toBe("finished");
      expect(result.result?.toLowerCase()).toContain("pong");
    },
    60_000,
  );
});
