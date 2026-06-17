/**
 * Pi SDK Agent Runner — wraps @earendil-works/pi-coding-agent to give
 * oaiorchestrator phases access to the full pi agent runtime: tool calling,
 * MCP tools via extensions, streaming, and structured output.
 *
 * Where OpenAiChatRunner sends a single prompt and parses text, this runner
 * creates a live AgentSession that can call tools (bash, read, write, plus
 * any MCP tools exposed by loaded extensions) and streams the response.
 */
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";

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
   * Built-in tools to enable. Defaults to ["read", "bash", "edit", "write"].
   * Include MCP tool names (from extensions) to give the agent access.
   * Set to ["read"] for read-only mode.
   */
  tools?: string[];

  /**
   * Disable specific tools that would otherwise be available.
   */
  excludeTools?: string[];

  /**
   * Additional extension paths to load (e.g. MCP gateway extensions).
   * Extensions in ~/.pi/agent/extensions/ and .pi/extensions/ are
   * auto-discovered by DefaultResourceLoader.
   */
  additionalExtensionPaths?: string[];
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

// Lightweight lazy imports — the pi SDK is only loaded when this runner is
// actually used. This keeps the import cost zero for users who stick with
// OpenAiChatRunner.
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

export class PiAgentRunner implements AgentRunner {
  readonly name = "pi-agent";

  private readonly options: Required<PiAgentRunnerOptions>;

  constructor(options: PiAgentRunnerOptions = {}) {
    this.options = {
      apiKey: options.apiKey ?? "",
      baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
      temperature: options.temperature ?? 0.2,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      tools: options.tools ?? DEFAULT_TOOLS,
      excludeTools: options.excludeTools ?? [],
      additionalExtensionPaths: options.additionalExtensionPaths ?? [],
    };
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const { createAgentSession, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader } =
      await loadPiSdk();

    // --- Resolve API key ---
    const apiKey =
      input.apiKey ||
      this.options.apiKey ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        status: "error",
        error: "OPENAI_API_KEY is required for the Pi agent runner",
        artifacts: [],
      };
    }

    const authStorage = AuthStorage.create();
    authStorage.setRuntimeApiKey("openai", apiKey);

    // --- Resolve model ---
    const modelId =
      input.agentConfig.model && input.agentConfig.model !== "auto"
        ? input.agentConfig.model
        : this.options.model;

    const baseUrl =
      input.agentConfig.baseUrl || this.options.baseUrl;

    const modelRegistry = ModelRegistry.create(authStorage);

    // Resolve a model object. Try built-in first, then build a custom one
    // for arbitrary OpenAI-compatible endpoints.
    const model: PiModel = await this.resolveModel(modelId, baseUrl);

    // --- System prompt ---
    const systemPrompt = this.buildSystemPrompt(input);

    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const resourceLoader = new DefaultResourceLoader({
      cwd: input.cwd,
      agentDir: getAgentDir(),
      additionalExtensionPaths: this.options.additionalExtensionPaths,
      systemPromptOverride: () => systemPrompt,
    });
    await resourceLoader.reload();

    // --- Create session ---
    const { session } = await createAgentSession({
      model,
      authStorage,
      modelRegistry,
      resourceLoader,
      tools: this.options.tools,
      excludeTools: this.options.excludeTools,
      sessionManager: SessionManager.inMemory(),
      thinkingLevel: "off",
    });

    // --- Collect output ---
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
        // Check for error state
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
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: "error",
        error: `Pi agent runner failed: ${message}`,
        artifacts: [],
      };
    }

    unsubscribe();

    if (hasError) {
      session.dispose();
      return {
        success: false,
        status: "error",
        error: errorMessage || "Agent reported an error",
        artifacts: [],
      };
    }

    // --- Extract artifacts ---
    const artifacts = this.extractArtifacts(resultText);

    session.dispose();

    return {
      success: true,
      status: "finished",
      result: resultText,
      agentSessionId: `pi-${input.phaseId}`,
      artifacts,
    };
  }

  /**
   * Resolve a pi Model object. Tries the built-in registry first, then
   * constructs a custom model for arbitrary OpenAI-compatible endpoints.
   */
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

  /**
   * Build a system prompt that matches oaiorchestrator's agent role system
   * while informing the model that it has access to tools.
   */
  private buildSystemPrompt(input: AgentRunInput): string {
    return [
      `You are an agent executing a phase in the oaiorchestrator framework.`,
      `Your role: ${input.agentConfig.type}.`,
      ``,
      `## Instructions`,
      input.agentConfig.instructions,
      ``,
      `## Capabilities`,
      `You have access to tools (read, write, bash, edit, and any MCP tools`,
      `available through extensions). Use them to complete the objective.`,
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
    ].join("\n");
  }

  /**
   * Extract artifact filenames from fenced code blocks tagged with `name=`.
   * Mirrors the extraction logic in OpenAiChatRunner.writeArtifacts so
   * PhaseRunner's backfill logic works identically for both runners.
   */
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
