/**
 * MCP Client Manager — self-contained MCP integration for PiAgentRunner.
 *
 * Connects to configured MCP servers (stdio or HTTP), discovers their tools,
 * and wraps them as pi-compatible ToolDefinitions. No host extensions needed.
 */
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── Configuration ───────────────────────────────────────────────────────────

export interface McpStdioServerConfig {
  name: string;
  transport: "stdio";
  /** Command to spawn the MCP server process. */
  command: string;
  /** Arguments for the command. */
  args?: string[];
  /** Environment variables for the server process. */
  env?: Record<string, string>;
  /** Working directory for the server process. */
  cwd?: string;
}

export interface McpHttpServerConfig {
  name: string;
  transport: "http";
  /** URL of the MCP server (e.g. http://localhost:3000/mcp). */
  url: string;
  /** Optional headers (e.g. Authorization). */
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

// ── Manager result ──────────────────────────────────────────────────────────

interface ConnectedServer {
  config: McpServerConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any; // MCP Client instance
  toolNames: string[];
}

export interface McpClientManagerResult {
  /** Tool definitions ready for pi's customTools. */
  tools: ToolDefinition[];
  /** Names of tools discovered (for the pi tools allowlist). */
  toolNames: string[];
  /** Errors encountered during connection/discovery (non-fatal). */
  warnings: string[];
  /** Clean up all MCP connections. */
  dispose: () => Promise<void>;
}

// ── Dynamic import helper ───────────────────────────────────────────────────

// We use dynamic imports with .js extensions because the MCP SDK v1.29+
// exposes transports only via wildcard exports. The @modelcontextprotocol/sdk
// package has a "./*" wildcard that maps to ./dist/esm/*.js files.
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
 * pi-compatible ToolDefinitions. Call `dispose()` when the agent session ends.
 */
export async function createMcpClientManager(
  servers: McpServerConfig[],
): Promise<McpClientManagerResult> {
  const { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport } =
    await loadMcpTransports();

  const connected: ConnectedServer[] = [];
  const warnings: string[] = [];

  for (const server of servers) {
    try {
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
        await client.connect(transport);
      } else {
        const url = new URL(server.url);
        try {
          const transport = new StreamableHTTPClientTransport(url);
          await client.connect(transport);
        } catch {
          const transport = new SSEClientTransport(url);
          await client.connect(transport);
        }
      }

      const { tools: mcpTools } = await client.listTools();
      const toolNames = mcpTools.map((t: { name: string }) => t.name);

      connected.push({ config: server, client, toolNames });

      if (mcpTools.length === 0) {
        warnings.push(`MCP server "${server.name}": connected but no tools discovered`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`MCP server "${server.name}": ${message}`);
    }
  }

  // Build pi ToolDefinitions from all discovered tools
  const allTools: ToolDefinition[] = [];
  const allToolNames: string[] = [];

  for (const { client } of connected) {
    const { tools: mcpTools } = await client.listTools();

    for (const def of mcpTools) {
      allToolNames.push(def.name);

      const clientRef = client;
      const toolDef: ToolDefinition = {
        name: def.name,
        label: def.name,
        description: def.description ?? `MCP tool: ${def.name}`,
        // Accept any JSON object — the MCP server validates against its schema
        parameters: Type.Record(Type.String(), Type.Unknown()) as unknown as ToolDefinition["parameters"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async execute(_toolCallId: string, params: any) {
          try {
            const result = await clientRef.callTool({
              name: def.name,
              arguments: params as Record<string, unknown>,
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
      for (const { client } of connected) {
        try {
          await client.close();
        } catch {
          // Best effort cleanup
        }
      }
    },
  };
}
