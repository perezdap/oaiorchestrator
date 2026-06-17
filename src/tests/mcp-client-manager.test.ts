import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMcpClientManager,
  validateMcpStdioServer,
} from "../runners/mcpClientManager.js";
import { createTempCwd } from "./helpers/tempDirs.js";

const { mockConnect, mockListTools, mockClose } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockListTools: vi.fn(),
  mockClose: vi.fn(),
}));

let streamableHttpShouldFail = false;

vi.mock("@modelcontextprotocol/sdk/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    listTools: mockListTools,
    close: mockClose,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation((config) => ({ kind: "stdio", config })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((url) => ({
    kind: "streamable-http",
    url,
    connect: () => {
      if (streamableHttpShouldFail) {
        throw new Error("streamable HTTP unavailable");
      }
    },
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn().mockImplementation((url) => ({ kind: "sse", url })),
}));

afterEach(() => {
  mockConnect.mockReset();
  mockListTools.mockReset();
  mockClose.mockReset();
  streamableHttpShouldFail = false;
  mockConnect.mockResolvedValue(undefined);
  mockListTools.mockResolvedValue({ tools: [] });
  mockClose.mockResolvedValue(undefined);
});

describe("validateMcpStdioServer", () => {
  it("blocks destructive commands via commandPolicy", () => {
    const error = validateMcpStdioServer(
      {
        name: "bad",
        transport: "stdio",
        command: "git",
        args: ["reset", "--hard"],
      },
      "/workspace",
    );

    expect(error).toContain("blocked by policy");
  });

  it("blocks cwd outside the workspace", () => {
    const workspace = createTempCwd("mcp-policy-");
    const error = validateMcpStdioServer(
      {
        name: "escape",
        transport: "stdio",
        command: "npx",
        cwd: "/etc",
      },
      workspace,
    );

    expect(error).toContain("outside workspace");
  });
});

describe("createMcpClientManager", () => {
  it("connects to stdio servers and discovers tools", async () => {
    mockListTools.mockResolvedValue({
      tools: [{ name: "search", description: "Search the web" }],
    });

    const result = await createMcpClientManager([
      {
        name: "demo",
        transport: "stdio",
        command: "npx",
        args: ["-y", "demo-mcp"],
      },
    ]);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(result.toolNames).toEqual(["search"]);
    expect(result.tools).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("records a warning when a server exposes no tools", async () => {
    const warnings: string[] = [];

    const result = await createMcpClientManager(
      [{ name: "empty", transport: "stdio", command: "npx" }],
      { onWarning: (message) => warnings.push(message) },
    );

    expect(result.toolNames).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no tools discovered");
    expect(warnings).toEqual(result.warnings);
  });

  it("continues when one server fails and still connects others", async () => {
    mockConnect
      .mockRejectedValueOnce(new Error("spawn failed"))
      .mockResolvedValueOnce(undefined);
    mockListTools.mockResolvedValue({
      tools: [{ name: "ok-tool", description: "works" }],
    });

    const result = await createMcpClientManager([
      { name: "broken", transport: "stdio", command: "missing-binary" },
      { name: "good", transport: "stdio", command: "npx" },
    ]);

    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("broken");
    expect(result.toolNames).toEqual(["ok-tool"]);
  });

  it("falls back to SSE when streamable HTTP connect fails", async () => {
    streamableHttpShouldFail = true;
    mockListTools.mockResolvedValue({
      tools: [{ name: "remote-tool", description: "remote" }],
    });

    const result = await createMcpClientManager([
      {
        name: "remote",
        transport: "http",
        url: "http://localhost:3000/mcp",
      },
    ]);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(result.toolNames).toEqual(["remote-tool"]);
    expect(result.warnings).toEqual([]);
  });

  it("times out hung connections", async () => {
    mockConnect.mockImplementation(
      () => new Promise(() => undefined),
    );

    const result = await createMcpClientManager(
      [{ name: "slow", transport: "stdio", command: "sleep" }],
      { connectTimeoutMs: 20 },
    );

    expect(result.warnings[0]).toContain("timed out");
  });

  it("disposes connected clients", async () => {
    const result = await createMcpClientManager([
      { name: "demo", transport: "stdio", command: "npx" },
    ]);

    await result.dispose();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("reports dispose failures via onWarning", async () => {
    mockClose.mockRejectedValue(new Error("close failed"));
    const warnings: string[] = [];

    const result = await createMcpClientManager(
      [{ name: "demo", transport: "stdio", command: "npx" }],
      { onWarning: (message) => warnings.push(message) },
    );

    await result.dispose();

    expect(warnings.some((message) => message.includes("dispose failed"))).toBe(true);
  });

  it("skips stdio servers blocked by policy", async () => {
    const result = await createMcpClientManager([
      {
        name: "destructive",
        transport: "stdio",
        command: "rm",
        args: ["-rf", "/"],
      },
    ]);

    expect(mockConnect).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain("blocked by policy");
  });

  it("validates stdio cwd against workspaceRoot", async () => {
    const workspace = createTempCwd("mcp-cwd-");

    const result = await createMcpClientManager(
      [
        {
          name: "escape",
          transport: "stdio",
          command: "npx",
          cwd: join(workspace, "..", "outside"),
        },
      ],
      { workspaceRoot: workspace },
    );

    expect(mockConnect).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain("outside workspace");
  });
});
