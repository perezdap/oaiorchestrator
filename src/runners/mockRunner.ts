import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";

export interface MockAgentResponse {
  phaseId: string;
  result: string;
  artifacts?: Record<string, string>;
  success?: boolean;
}

export class MockAgentRunner implements AgentRunner {
  readonly name = "mock";

  constructor(private readonly responses: Map<string, MockAgentResponse> = new Map()) {}

  setResponse(phaseId: string, response: MockAgentResponse): void {
    this.responses.set(phaseId, response);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const response = this.responses.get(input.phaseId) ?? {
      phaseId: input.phaseId,
      result: `Mock completion for phase ${input.phaseId}`,
      success: true,
      artifacts: {},
    };

    const artifactPaths: string[] = [];
    if (response.artifacts) {
      mkdirSync(input.artifactsDir, { recursive: true });
      for (const [name, content] of Object.entries(response.artifacts)) {
        const path = join(input.artifactsDir, name);
        writeFileSync(path, content, "utf-8");
        artifactPaths.push(name);
      }
    }

    return {
      success: response.success ?? true,
      status: (response.success ?? true) ? "finished" : "error",
      result: response.result,
      agentSessionId: `mock-agent-${input.phaseId}`,
      runSessionId: `mock-run-${input.runId}-${input.phaseId}`,
      artifacts: artifactPaths,
    };
  }
}
