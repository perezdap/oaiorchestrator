/**
 * MCP Client Manager — self-contained MCP integration for PiAgentRunner.
 *
 * Connects to configured MCP servers (stdio or HTTP), discovers their tools,
 * and wraps them as pi-compatible tool definitions. No host extensions needed.
 */
import { evaluateCommand } from "../policies/commandPolicy.js";
import { isWithinWorkspace } from "../policies/filePolicy.js";
import type { McpServerConfig } from "../schemas/mcp.schema.js";

export type {
  McpHttpServerConfig,
  McpServerConfig,
  McpStdioServerConfig,
} from "../schemas/mcp.schema.js";

/** Tool shape accepted by pi's `customTools` without importing the pi SDK at compile time. */
export interface PiCompatibleToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }>;
}

// ── Manager result ──────────────────────────────────────────────────────────

interface ConnectedServer {
  config: McpServerConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any; // MCP Client instance — TODO: type against @modelcontextprotocol/sdk Client
  toolNames: string[];
}

export interface McpClientManagerOptions {
  /** Per-server connection timeout in milliseconds. Defaults to 30_000. */
  connectTimeoutMs?: number;
  /** Workspace root used to validate stdio `cwd` paths. */
  workspaceRoot?: string;
  /** Non-fatal warnings (policy blocks, connection failures, dispose errors). */
  onWarning?: (message: string) => void;
}

export interface McpClientManagerResult {
  /** Tool definitions ready for pi's customTools. */
  tools: PiCompatibleToolDefinition[];
  /** Names of tools discovered (for the pi tools allowlist). */
  toolNames: string[];
  /** Errors encountered during connection/discovery (non-fatal). */
  warnings: string[];
  /** Clean up all MCP connections. */
  dispose: () => Promise<void>;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

function warn(options: McpClientManagerOptions, message: string, warnings: string[]): void {
  warnings.push(message);
  options.onWarning?.(message);
}

function formatStdioCommand(server: Extract<McpServerConfig, { transport: "stdio" }>): string {
  return [server.command, ...(server.args ?? [])].join(" ").trim();
}

export function validateMcpStdioServer(
  server: Extract<McpServerConfig, { transport: "stdio" }>,
  workspaceRoot?: string,
): string | undefined {
  const commandText = formatStdioCommand(server);
  const commandPolicy = evaluateCommand(commandText);
  if (commandPolicy.verdict === "block") {
    return `command blocked by policy: ${commandPolicy.reason}`;
  }

  if (server.cwd && workspaceRoot && !isWithinWorkspace(server.cwd, workspaceRoot)) {
    return `cwd "${server.cwd}" is outside workspace "${workspaceRoot}"`;
  }

  return undefined;
}

function mcpToolParameters(def: { inputSchema?: unknown }): unknown {
  if (
    def.inputSchema &&
    typeof def.inputSchema === "object" &&
    !Array.isArray(def.inputSchema)
  ) {
    return def.inputSchema;
  }

  return { type: "object", properties: {} };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Dynamic import helper ───────────────────────────────────────────────────

async function loadMcpTransports() {
  const [
    { Client },
    { StdioClientTransport },
    { StreamableHTTPClientTransport },
    { SSEClientTransport },
  ] = await Promise.all([
    import("@modelcontextprotocol/sdk/client"),
    import("@modelcontextprotocol/sdk/client/stdio.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
    import("@modelcontextprotocol/sdk/client/sse.js"),
  ]);
  return { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport };
}

// ── Manager ─────────────────────────────────────────────────────────────────

/**
 * Connects to configured MCP servers, discovers their tools, and returns
 * pi-compatible tool definitions. Call `dispose()` when the agent session ends.
 *
 * Connection failures are non-fatal: warnings are collected and other servers
 * still connect.
 */
export async function createMcpClientManager(
  servers: McpServerConfig[],
  options: McpClientManagerOptions = {},
): Promise<McpClientManagerResult> {
  const { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport } =
    await loadMcpTransports();

  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const connected: ConnectedServer[] = [];
  const warnings: string[] = [];

  for (const server of servers) {
    try {
      if (server.transport === "stdio") {
        const validationError = validateMcpStdioServer(server, options.workspaceRoot);
        if (validationError) {
          warn(options, `MCP server "${server.name}": ${validationError}`, warnings);
          continue;
        }
      }

      const client = new Client({
        name: `oaiorchestrator-${server.name}`,
        version: "1.0.0",
      });

      if (server.transport === "stdio") {
        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args ?? [],
          env: server.env,
          cwd: server.cwd,
        });
        await withTimeout(
          client.connect(transport),
          connectTimeoutMs,
          `MCP server "${server.name}" stdio connect`,
        );
      } else {
        const url = new URL(server.url);
        try {
          const transport = new StreamableHTTPClientTransport(url);
          await withTimeout(
            client.connect(transport),
            connectTimeoutMs,
            `MCP server "${server.name}" HTTP connect`,
          );
        } catch {
          const transport = new SSEClientTransport(url);
          await withTimeout(
            client.connect(transport),
            connectTimeoutMs,
            `MCP server "${server.name}" SSE connect`,
          );
        }
      }

      const { tools: mcpTools } = await client.listTools();
      const toolNames = mcpTools.map((t: { name: string }) => t.name);

      connected.push({ config: server, client, toolNames });

      if (mcpTools.length === 0) {
        warn(
          options,
          `MCP server "${server.name}": connected but no tools discovered`,
          warnings,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(options, `MCP server "${server.name}": ${message}`, warnings);
    }
  }

  const allTools: PiCompatibleToolDefinition[] = [];
  const allToolNames: string[] = [];

  for (const { client } of connected) {
    const { tools: mcpTools } = await client.listTools();

    for (const def of mcpTools) {
      allToolNames.push(def.name);

      const clientRef = client;
      const toolDef: PiCompatibleToolDefinition = {
        name: def.name,
        label: def.name,
        description: def.description ?? `MCP tool: ${def.name}`,
        parameters: mcpToolParameters(def),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const result = await clientRef.callTool({
              name: def.name,
              arguments: params,
            });

            if (result.isError) {
              const errorText = result.content
                .map((c: { type: string; text?: string }) =>
                  c.type === "text" ? c.text : JSON.stringify(c),
                )
                .join("\n");
              return {
                content: [{ type: "text" as const, text: `MCP tool error: ${errorText}` }],
                details: { isError: true },
              };
            }

            const texts = result.content
              .map((c: { type: string; text?: string }) =>
                c.type === "text" ? c.text : JSON.stringify(c),
              )
              .join("\n");

            return {
              content: [{ type: "text" as const, text: texts || "(empty result)" }],
              details: {},
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text" as const, text: `MCP tool call failed: ${message}` }],
              details: { isError: true },
            };
          }
        },
      };

      allTools.push(toolDef);
    }
  }

  return {
    tools: allTools,
    toolNames: allToolNames,
    warnings,
    dispose: async () => {
      for (const { config, client } of connected) {
        try {
          await client.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warn(
            options,
            `MCP server "${config.name}": dispose failed: ${message}`,
            warnings,
          );
        }
      }
    },
  };
}
