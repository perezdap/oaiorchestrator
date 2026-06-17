import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiChatRunner } from "../runners/openAiChatRunner.js";
import type { AgentRunInput } from "../runners/types.js";
import { createTempCwd } from "./helpers/tempDirs.js";

function makeInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  const cwd = createTempCwd("openai-runner-test-");
  return {
    agentId: "researcher",
    agentConfig: {
      type: "researcher",
      model: "auto",
      instructions: "Test instructions",
    },
    prompt: "Test prompt",
    cwd,
    runId: "openai-runner-test",
    phaseId: "phase-1",
    artifactsDir: join(cwd, "artifacts"),
    ...overrides,
  };
}

function chatResponse(content: string, id = "chatcmpl-test"): Response {
  return new Response(
    JSON.stringify({ id, choices: [{ message: { content }, finish_reason: "stop" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenAiChatRunner", () => {
  it("fails fast when no API key is available", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const runner = new OpenAiChatRunner();

    const result = await runner.run(makeInput());

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.error).toContain("OPENAI_API_KEY");
  });

  it("maps a successful completion to AgentRunResult", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("Hello from the model"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    const result = await runner.run(makeInput());

    expect(result.success).toBe(true);
    expect(result.status).toBe("finished");
    expect(result.result).toBe("Hello from the model");
    expect(result.runSessionId).toBe("chatcmpl-test");
  });

  it("resolves baseUrl and model from agent config over defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    await runner.run(
      makeInput({
        agentConfig: {
          type: "researcher",
          model: "grok-3",
          baseUrl: "https://api.x.ai/v1/",
          instructions: "Test",
        },
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe("grok-3");
  });

  it("falls back to env for baseUrl and default model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-token");
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example.com/v1");
    vi.stubEnv("OPENAI_DEFAULT_MODEL", "custom-model");
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner();

    const result = await runner.run(makeInput());

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer env-token");
    expect(JSON.parse(init.body as string).model).toBe("custom-model");
  });

  it("accepts a full chat completions URL as the endpoint", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example.com/v1/chat/completions");
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    await runner.run(makeInput());

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://gateway.example.com/v1/chat/completions");
  });

  it("sends the api-key header for Azure endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "azure-key" });

    await runner.run(
      makeInput({
        agentConfig: {
          type: "researcher",
          model: "gpt-4o",
          baseUrl:
            "https://res.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-02-01",
          instructions: "Test",
        },
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("azure-key");
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends the bearer header for standard OpenAI endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "openai-key" });

    await runner.run(makeInput());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer openai-key");
    expect(headers["api-key"]).toBeUndefined();
  });

  it("preserves query strings on full endpoint URLs (Azure style)", async () => {
    vi.stubEnv(
      "OPENAI_BASE_URL",
      "https://res.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-02-01",
    );
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    await runner.run(makeInput());

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://res.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-02-01",
    );
  });

  it("normalizes a trailing slash before the query on full endpoint URLs", async () => {
    vi.stubEnv(
      "OPENAI_BASE_URL",
      "https://res.openai.azure.com/openai/deployments/d/chat/completions/?api-version=2024-02-01",
    );
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    await runner.run(makeInput());

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://res.openai.azure.com/openai/deployments/d/chat/completions?api-version=2024-02-01",
    );
  });

  it("writes named fenced blocks to the artifacts directory", async () => {
    const content = [
      "Here is the research:",
      "```json name=research.json",
      '{ "url": "https://example.com/setup.exe" }',
      "```",
      "And notes:",
      "```markdown name=notes.md",
      "# Notes",
      "```",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(content)));
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });
    const input = makeInput();

    const result = await runner.run(input);

    expect(result.artifacts).toEqual(["research.json", "notes.md"]);
    expect(JSON.parse(readFileSync(join(input.artifactsDir, "research.json"), "utf-8"))).toEqual({
      url: "https://example.com/setup.exe",
    });
    expect(readFileSync(join(input.artifactsDir, "notes.md"), "utf-8")).toContain("# Notes");
  });

  it("redacts secrets in written artifacts", async () => {
    const content = [
      "```text name=notes.txt",
      "token=sk-abcdefghijklmnopqrstuvwxyz123456",
      "```",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(content)));
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });
    const input = makeInput();

    const result = await runner.run(input);

    expect(result.artifacts).toEqual(["notes.txt"]);
    const written = readFileSync(join(input.artifactsDir, "notes.txt"), "utf-8");
    expect(written).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("rejects artifact names that escape the artifacts directory", async () => {
    const content = ["```text name=../escape.txt", "nope", "```"].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(content)));
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });
    const input = makeInput();

    const result = await runner.run(input);

    expect(result.artifacts).toEqual([]);
    expect(existsSync(join(input.artifactsDir, "..", "escape.txt"))).toBe(false);
  });

  it("returns a redacted error result on non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"error": "invalid key sk-abcdefghijklmnopqrstuvwxyz123456"}', {
          status: 401,
        }),
      ),
    );
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    const result = await runner.run(makeInput());

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 401");
    expect(result.error).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("returns an error result when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const runner = new OpenAiChatRunner({ apiKey: "test-key" });

    const result = await runner.run(makeInput());

    expect(result.success).toBe(false);
    expect(result.status).toBe("error");
    expect(result.error).toContain("ECONNREFUSED");
  });
});
