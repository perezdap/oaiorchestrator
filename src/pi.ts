/**
 * Optional Pi SDK + MCP runner entry point.
 *
 * Install peer dependencies before importing:
 *   npm install @earendil-works/pi-ai @earendil-works/pi-coding-agent @modelcontextprotocol/sdk
 */
export { PiAgentRunner, type PiAgentRunnerOptions } from "./runners/piAgentRunner.js";
export {
  createMcpClientManager,
  type McpClientManagerOptions,
  type McpClientManagerResult,
} from "./runners/mcpClientManager.js";
export {
  mcpServerConfigSchema,
  mcpStdioServerConfigSchema,
  mcpHttpServerConfigSchema,
  type McpServerConfig,
  type McpStdioServerConfig,
  type McpHttpServerConfig,
} from "./schemas/mcp.schema.js";
