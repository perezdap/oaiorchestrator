/**
 * PiAgentRunner programmatic example (requires peer dependencies).
 *
 * Install optional peers first:
 *   npm install @earendil-works/pi-ai @earendil-works/pi-coding-agent @modelcontextprotocol/sdk
 *
 * Run from the repository root:
 *   npm run example:pi
 *
 * Set OPENAI_API_KEY for a live run. Without it, the example exits after
 * validating configuration and showing how MCP servers are wired.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiAgentRunner } from "../pi.js";

async function main(): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "orchestrator-pi-example-"));
  const warnings: string[] = [];

  const runner = new PiAgentRunner({
    apiKey: process.env.OPENAI_API_KEY,
    mcpServers: [
      {
        name: "demo",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      },
    ],
    onWarning: (message) => warnings.push(message),
  });

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is not set. Example configured PiAgentRunner with a demo MCP server.",
    );
    console.error(`Workspace: ${cwd}`);
    console.error("Install peer deps and set OPENAI_API_KEY to run a live session.");
    return;
  }

  const result = await runner.run({
    agentId: "researcher",
    agentConfig: {
      type: "researcher",
      model: "auto",
      instructions: "Summarize what MCP tools are available.",
    },
    prompt: "List the MCP tools you can see and stop.",
    cwd,
    runId: "pi-example",
    phaseId: "discover-tools",
    artifactsDir: join(cwd, "artifacts"),
  });

  if (warnings.length > 0) {
    console.error("MCP warnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }

  if (!result.success) {
    console.error(result.error ?? "Pi agent run failed");
    process.exitCode = 1;
    return;
  }

  console.log(result.result ?? "(no text response)");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
