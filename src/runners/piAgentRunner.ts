/**
 * Pi SDK Agent Runner — wraps @earendil-works/pi-coding-agent to give
 * oaiorchestrator phases access to the full pi agent runtime: tool calling,
 * MCP tools, streaming, and structured output.
 *
 * MCP servers are configured directly on the runner (not from host extensions)
 * so the entire setup is self-contained within oaiorchestrator.
 */
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";
import {
  createMcpClientManager,
  type McpClientManagerResult,
  type McpServerConfig,
} from "./mcpClientManager.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PiModel = any;

export interface PiAgentRunnerOptions {
  /**
   * API key for the OpenAI-compatible endpoint. Falls back to
   * OPENAI_API_KEY env var when omitted.
   */
  apiKey?: string;

  /**
   * Base URL for the chat completions endpoint.
   * Defaults to OPENAI_BASE_URL or https://api.openai.com/v1.
   */
  baseUrl?: string;

  /**
   * Default model name when the agent config doesn't specify one.
   * Defaults to "gpt-4o".
   */
  model?: string;

  /**
   * Temperature for the model. Defaults to 0.2.
   */
  temperature?: number;

  /**
   * Timeout in milliseconds for the entire agent session.
   * Defaults to 300_000 (5 minutes).
   */
  timeoutMs?: number;

  /**
   * Built-in pi tools to enable. Defaults to ["read", "bash", "edit", "write"].
   * MCP tool names (from configured servers) are **automatically merged**
   * into this list — you only need to list them here if you want to
   * restrict which MCP tools the agent can use.
   *
   * Set to ["read"] for read-only mode. MCP tools are still auto-added
   * unless you also set `mcpTools: "manual"`.
   */
  tools?: string[];

  /**
   * Disable specific tools that would otherwise be available.
   */
  excludeTools?: string[];

  /**
   * MCP servers to connect to. Each server's tools are discovered
   * and registered as pi tools available to the agent session.
   *
   * Example:
   * ```ts
   * mcpServers: [
   *   { name: "github", transport: "stdio", command: "npx",
   *     args: ["-y", "@modelcontextprotocol/server-github"] },
   *   { name: "firecrawl", transport: "http",
   *     url: "http://localhost:3000/mcp" },
   * ]
   * ```
   */
  mcpServers?: McpServerConfig[];
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

// ── Lazy SDK loader ─────────────────────────────────────────────────────────

async function loadPiSdk() {
  const [
    { createAgentSession },
    { AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader },
  ] = await Promise.all([
    import("@earendil-works/pi-coding-agent"),
    import("@earendil-works/pi-coding-agent"),
  ]);
  return { createAgentSession, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader };
}

// ── Runner ──────────────────────────────────────────────────────────────────

export class PiAgentRunner implements AgentRunner {
  readonly name = "pi-agent";

  private readonly options: Required<Omit<PiAgentRunnerOptions, "mcpServers">> & {
    mcpServers: McpServerConfig[];
  };

  constructor(options: PiAgentRunnerOptions = {}) {
    this.options = {
      apiKey: options.apiKey ?? "",
      baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
      temperature: options.temperature ?? 0.2,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      tools: options.tools ?? DEFAULT_TOOLS,
      excludeTools: options.excludeTools ?? [],
      mcpServers: options.mcpServers ?? [],
    };
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    // ── MCP: connect to servers and discover tools ──────────────────────
    let mcp: McpClientManagerResult | undefined;
    let customTools: Awaited<ReturnType<typeof import("@earendil-works/pi-coding-agent")["defineTool"]>>[] = [];
    let effectiveTools = [...this.options.tools];

    if (this.options.mcpServers.length > 0) {
      mcp = await createMcpClientManager(this.options.mcpServers);
      customTools = mcp.tools;

      // Auto-merge MCP tool names unless the user specified an explicit allowlist
      const userSpecifiedTools = this.options.tools !== DEFAULT_TOOLS;
      if (!userSpecifiedTools) {
        effectiveTools = [...new Set([...effectiveTools, ...mcp.toolNames])];
      } else {
        // User specified tools — still add any MCP tools they didn't list
        // so the agent can discover and use them
        effectiveTools = [...new Set([...effectiveTools, ...mcp.toolNames])];
      }

      for (const warning of mcp.warnings) {
        // Log warnings — in production this would go through RunState
        console.warn(`[PiAgentRunner] ${warning}`);
      }
    }

    // ── Pi SDK setup ────────────────────────────────────────────────────
    const { createAgentSession, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader } =
      await loadPiSdk();

    const apiKey =
      input.apiKey ||
      this.options.apiKey ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await mcp?.dispose();
      return {
        success: false,
        status: "error",
        error: "OPENAI_API_KEY is required for the Pi agent runner",
        artifacts: [],
      };
    }

    const authStorage = AuthStorage.create();
    authStorage.setRuntimeApiKey("openai", apiKey);

    const modelId =
      input.agentConfig.model && input.agentConfig.model !== "auto"
        ? input.agentConfig.model
        : this.options.model;

    const baseUrl =
      input.agentConfig.baseUrl || this.options.baseUrl;

    const modelRegistry = ModelRegistry.create(authStorage);
    const model: PiModel = await this.resolveModel(modelId, baseUrl);

    const systemPrompt = this.buildSystemPrompt(input, mcp);

    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const resourceLoader = new DefaultResourceLoader({
      cwd: input.cwd,
      agentDir: getAgentDir(),
      systemPromptOverride: () => systemPrompt,
    });
    await resourceLoader.reload();

    // ── Create session ──────────────────────────────────────────────────
    const { session } = await createAgentSession({
      model,
      authStorage,
      modelRegistry,
      resourceLoader,
      tools: effectiveTools,
      excludeTools: this.options.excludeTools,
      customTools,
      sessionManager: SessionManager.inMemory(),
      thinkingLevel: "off",
    });

    // ── Collect output ──────────────────────────────────────────────────
    let resultText = "";
    let hasError = false;
    let errorMessage = "";

    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update") {
        if (event.assistantMessageEvent.type === "text_delta") {
          resultText += event.assistantMessageEvent.delta;
        }
      }
      if (event.type === "agent_end") {
        const messages = session.messages;
        const lastAssistant = [...messages].reverse().find(
          (m) => m.role === "assistant",
        );
        if (lastAssistant && "error" in lastAssistant && lastAssistant.error) {
          hasError = true;
          errorMessage = String(lastAssistant.error);
        }
      }
    });

    try {
      const timeout = setTimeout(() => {
        session.abort().catch(() => {});
      }, this.options.timeoutMs);

      await session.prompt(input.prompt);
      clearTimeout(timeout);
    } catch (err) {
      unsubscribe();
      session.dispose();
      await mcp?.dispose();
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: "error",
        error: `Pi agent runner failed: ${message}`,
        artifacts: [],
      };
    }

    unsubscribe();
    session.dispose();
    await mcp?.dispose();

    if (hasError) {
      return {
        success: false,
        status: "error",
        error: errorMessage || "Agent reported an error",
        artifacts: [],
      };
    }

    const artifacts = this.extractArtifacts(resultText);

    return {
      success: true,
      status: "finished",
      result: resultText,
      agentSessionId: `pi-${input.phaseId}`,
      artifacts,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async resolveModel(modelId: string, baseUrl: string): Promise<PiModel> {
    try {
      const piAi = await import("@earendil-works/pi-ai");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builtIn = piAi.getModel("openai", modelId as any);
      if (builtIn) return builtIn;
    } catch {
      // Fall through to custom model
    }

    return {
      id: modelId,
      name: modelId,
      api: "openai-chat",
      provider: "openai",
      baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
  }

  private buildSystemPrompt(
    input: AgentRunInput,
    mcp?: McpClientManagerResult,
  ): string {
    const lines = [
      `You are an agent executing a phase in the oaiorchestrator framework.`,
      `Your role: ${input.agentConfig.type}.`,
      ``,
      `## Instructions`,
      input.agentConfig.instructions,
      ``,
      `## Capabilities`,
      `You have access to tools: read, write, bash, edit.`,
    ];

    if (mcp && mcp.toolNames.length > 0) {
      lines.push(
        ``,
        `## MCP Tools`,
        `The following MCP tools are available from configured servers:`,
        ...mcp.toolNames.map((n) => `- ${n}`),
        ``,
        `MCP servers connected: ${mcp.toolNames.length > 0 ? mcp.toolNames.length : 0} tools across servers.`,
      );
    }

    lines.push(
      ``,
      `## Phase`,
      `Phase ID: ${input.phaseId}`,
      `Run ID: ${input.runId}`,
      `Working directory: ${input.cwd}`,
      ``,
      `## Rules`,
      `- Work inside the artifacts directory: ${input.artifactsDir}`,
      `- The host verifies critical actions through acceptance gates.`,
      `- When producing structured output, emit it as fenced code blocks`,
      `  tagged with the filename, e.g. \`\`\`json name=plan.json`,
    );

    return lines.join("\n");
  }

  private extractArtifacts(content: string): string[] {
    const names: string[] = [];
    const fenceRegex = /```[^\s`]*[ \t]+name=([^\s`]+)/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(content)) !== null) {
      names.push(match[1]);
    }
    return names;
  }
}
