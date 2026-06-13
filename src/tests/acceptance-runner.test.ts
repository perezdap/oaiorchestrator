import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import { AcceptanceRunner, type AcceptanceRunnerOptions } from "../orchestrator/AcceptanceRunner.js";
import { MockAgentRunner } from "../runners/mockRunner.js";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRunner,
  ShellRunner,
  ShellRunInput,
  ShellRunResult,
} from "../runners/types.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "acceptance-test-"));
  tempDirs.push(dir);
  return dir;
}

function createMockShell(responses: Record<string, ShellRunResult>): ShellRunner {
  return {
    run: vi.fn(async (input: ShellRunInput): Promise<ShellRunResult> => {
      const key = input.command;
      if (responses[key]) return responses[key];
      return { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 };
    }),
  };
}

function createRunner(
  cwd: string,
  options: {
    shellRunner?: ShellRunner;
    agentRunner?: MockAgentRunner;
    approvalPolicy?: ApprovalPolicy;
    artifactsDir?: string;
    resolveAgentConfig?: AcceptanceRunnerOptions["resolveAgentConfig"];
  } = {},
): AcceptanceRunner {
  return new AcceptanceRunner({
    cwd,
    runId: "test-run",
    shellRunner: options.shellRunner ?? createMockShell({}),
    agentRunner: options.agentRunner,
    approvalPolicy: options.approvalPolicy,
    artifactsDir: options.artifactsDir,
    resolveAgentConfig: options.resolveAgentConfig,
  });
}

async function runSingle(
  runner: AcceptanceRunner,
  check: Parameters<AcceptanceRunner["runChecks"]>[0][number],
) {
  const report = await runner.runChecks([check], 1);
  return report.results[0];
}

describe("AcceptanceRunner check types", () => {
  describe("file_exists", () => {
    it("passes when file is present", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "hello.txt"), "content", "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "exists",
        type: "file_exists",
        path: "hello.txt",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when file is missing", async () => {
      const cwd = createTempCwd();
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "missing",
        type: "file_exists",
        path: "missing.txt",
        required: true,
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("file_contains", () => {
    it("passes when pattern matches", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "config.txt"), "version=1.0.0", "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "contains",
        type: "file_contains",
        path: "config.txt",
        pattern: "version=\\d+\\.\\d+\\.\\d+",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when pattern is absent", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "config.txt"), "no match here", "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "no-match",
        type: "file_contains",
        path: "config.txt",
        pattern: "version=",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("refuses to read files outside the workspace", async () => {
      const cwd = createTempCwd();
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "outside",
        type: "file_contains",
        path: "..\\..\\secrets.txt",
        pattern: ".",
        required: true,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/outside workspace/i);
    });

    it("refuses to probe sensitive files such as .env", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, ".env"), "OPENAI_API_KEY=sk-secret", "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "env-probe",
        type: "file_contains",
        path: ".env",
        pattern: "sk-",
        required: true,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/\.env/i);
    });
  });

  describe("json_shape", () => {
    it("passes when JSON matches expected shape", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "data.json"), JSON.stringify({ name: "test", count: 5 }), "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "json-ok",
        type: "json_shape",
        path: "data.json",
        schema: { name: "string", count: "number" },
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when JSON has wrong type", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "data.json"), JSON.stringify({ name: "test", count: "five" }), "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "json-bad-type",
        type: "json_shape",
        path: "data.json",
        schema: { name: "string", count: "number" },
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails when JSON file is missing a key", async () => {
      const cwd = createTempCwd();
      writeFileSync(join(cwd, "data.json"), JSON.stringify({ name: "test" }), "utf-8");
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "json-missing-key",
        type: "json_shape",
        path: "data.json",
        schema: { name: "string", count: "number" },
        required: true,
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("markdown_artifact", () => {
    it("passes when artifact meets minLength", async () => {
      const cwd = createTempCwd();
      const artifactsDir = join(cwd, ".runs", "test-run", "artifacts");
      mkdirSync(artifactsDir, { recursive: true });
      writeFileSync(join(artifactsDir, "plan.md"), "# Plan\n\nDetailed content here.", "utf-8");
      const runner = createRunner(cwd, { artifactsDir });
      const result = await runSingle(runner, {
        id: "md-ok",
        type: "markdown_artifact",
        path: "plan.md",
        minLength: 10,
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when artifact is too short", async () => {
      const cwd = createTempCwd();
      const artifactsDir = join(cwd, ".runs", "test-run", "artifacts");
      mkdirSync(artifactsDir, { recursive: true });
      writeFileSync(join(artifactsDir, "plan.md"), "x", "utf-8");
      const runner = createRunner(cwd, { artifactsDir });
      const result = await runSingle(runner, {
        id: "md-short",
        type: "markdown_artifact",
        path: "plan.md",
        minLength: 50,
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails when artifact is not found", async () => {
      const cwd = createTempCwd();
      const runner = createRunner(cwd);
      const result = await runSingle(runner, {
        id: "md-missing",
        type: "markdown_artifact",
        path: "missing.md",
        required: true,
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("test_result", () => {
    it("passes when vitest parser recognizes success output", async () => {
      const cwd = createTempCwd();
      const shellRunner = createMockShell({
        "npm test": {
          exitCode: 0,
          stdout: "Tests  5 passed",
          stderr: "",
          durationMs: 100,
        },
      });
      const runner = createRunner(cwd, { shellRunner });
      const result = await runSingle(runner, {
        id: "tests-ok",
        type: "test_result",
        command: "npm test",
        parser: "vitest",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails on non-zero exit code", async () => {
      const cwd = createTempCwd();
      const shellRunner = createMockShell({
        "npm test": {
          exitCode: 1,
          stdout: "Tests  2 failed",
          stderr: "error",
          durationMs: 100,
        },
      });
      const runner = createRunner(cwd, { shellRunner });
      const result = await runSingle(runner, {
        id: "tests-fail",
        type: "test_result",
        command: "npm test",
        parser: "generic",
        required: true,
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("manual_approval", () => {
    it("passes when auto-approved in test policy", async () => {
      const cwd = createTempCwd();
      const runner = createRunner(cwd, {
        approvalPolicy: new ApprovalPolicy({ autoApproveInTests: true, autoApproveManualChecks: true }),
      });
      const result = await runSingle(runner, {
        id: "manual-ok",
        type: "manual_approval",
        message: "Approve release",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when approval is pending", async () => {
      const cwd = createTempCwd();
      const runner = createRunner(cwd, {
        approvalPolicy: new ApprovalPolicy({ autoApproveInTests: false, autoApproveManualChecks: false }),
      });
      const result = await runSingle(runner, {
        id: "manual-pending",
        type: "manual_approval",
        message: "Approve release",
        required: true,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("pending");
    });
  });

  describe("command", () => {
    it("passes for allowed commands", async () => {
      const cwd = createTempCwd();
      const shellRunner = createMockShell({
        "Write-Output ok": { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 },
      });
      const runner = createRunner(cwd, { shellRunner });
      const result = await runSingle(runner, {
        id: "cmd-ok",
        type: "command",
        command: "Write-Output ok",
        required: true,
      });
      expect(result.passed).toBe(true);
      expect(shellRunner.run).toHaveBeenCalledOnce();
    });

    it("resolves a relative check cwd against the run workspace", async () => {
      const cwd = createTempCwd();
      const shellRunner = createMockShell({});
      const runner = createRunner(cwd, { shellRunner });
      await runSingle(runner, {
        id: "cmd-cwd",
        type: "command",
        command: "Write-Output hi",
        cwd: "tests",
        required: true,
      });
      const input = vi.mocked(shellRunner.run).mock.calls[0][0];
      expect(input.cwd).toBe(join(cwd, "tests"));
    });

    it("exposes the active run id and artifacts dir as environment variables", async () => {
      const cwd = createTempCwd();
      const artifactsDir = join(cwd, ".runs", "test-run", "artifacts");
      const shellRunner = createMockShell({});
      const runner = createRunner(cwd, { shellRunner, artifactsDir });
      await runSingle(runner, {
        id: "cmd-env",
        type: "command",
        command: "Write-Output $env:ORCH_ARTIFACTS_DIR",
        required: true,
      });
      const input = vi.mocked(shellRunner.run).mock.calls[0][0];
      expect(input.env?.ORCH_RUN_ID).toBe("test-run");
      expect(input.env?.ORCH_ARTIFACTS_DIR).toBe(artifactsDir);
    });

    it("fails for blocked commands without executing shell", async () => {
      const cwd = createTempCwd();
      const shellRunner = createMockShell({});
      const runner = createRunner(cwd, { shellRunner });
      const result = await runSingle(runner, {
        id: "cmd-blocked",
        type: "command",
        command: "git push origin main --force",
        required: true,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("blocked");
      expect(shellRunner.run).not.toHaveBeenCalled();
    });
  });

  describe("agent_review", () => {
    it("passes when agent returns pass result", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-ok", {
        phaseId: "acceptance-review-ok",
        result: "Review passed — all criteria met.\nVERDICT: PASS",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-ok",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails closed on negated pass text without a verdict line", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-negated", {
        phaseId: "acceptance-review-negated",
        result: "This does not pass acceptance.",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-negated",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails closed when a named review agent cannot be resolved", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      const runner = createRunner(cwd, {
        agentRunner: mockAgent,
        resolveAgentConfig: () => undefined,
      });
      const result = await runSingle(runner, {
        id: "review-unknown-agent",
        type: "agent_review",
        prompt: "Review the changes",
        agent: "typo-agent",
        required: true,
      });
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/unknown agent/i);
    });

    it("fails when the agent reports problems without saying the word fail", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-secrets", {
        phaseId: "acceptance-review-secrets",
        result: "I found hardcoded secrets in config.ts. There are blocking issues.",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-secrets",
        type: "agent_review",
        prompt: "Verify no hardcoded secrets remain",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("resolves the named agent's model and baseUrl for the review", async () => {
      const cwd = createTempCwd();
      const seen: { model?: string; baseUrl?: string } = {};
      const agentRunner = {
        name: "capture",
        run: vi.fn(async (input: AgentRunInput): Promise<AgentRunResult> => {
          seen.model = input.agentConfig.model;
          seen.baseUrl = input.agentConfig.baseUrl;
          return {
            success: true,
            status: "finished",
            result: "VERDICT: PASS",
            artifacts: [],
          };
        }),
      } satisfies AgentRunner;

      const runner = createRunner(cwd, {
        agentRunner: agentRunner as unknown as MockAgentRunner,
        resolveAgentConfig: (agentId) =>
          agentId === "special-reviewer"
            ? {
                type: "reviewer",
                model: "grok-3",
                baseUrl: "https://api.x.ai/v1",
                instructions: "Review",
              }
            : undefined,
      });

      const result = await runSingle(runner, {
        id: "review-resolved",
        type: "agent_review",
        prompt: "Review the changes",
        agent: "special-reviewer",
        required: true,
      });

      expect(result.passed).toBe(true);
      expect(seen.model).toBe("grok-3");
      expect(seen.baseUrl).toBe("https://api.x.ai/v1");
    });

    it("uses the final verdict line, not an inline mention", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-trailing", {
        phaseId: "acceptance-review-trailing",
        result: "I cannot give VERDICT: PASS because issues remain.\nVERDICT: FAIL",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-trailing",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails when problems follow a PASS verdict (verdict not final)", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-late", {
        phaseId: "acceptance-review-late",
        result: "VERDICT: PASS\nWait — I found hardcoded secrets after all.",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-late",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails on an inline VERDICT mention that is not the final verdict", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-inline", {
        phaseId: "acceptance-review-inline",
        result: "I cannot give VERDICT: PASS because unresolved vulnerabilities remain.",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-inline",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("fails on a caveated final verdict line", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-caveat", {
        phaseId: "acceptance-review-caveat",
        result: "Looks mostly fine.\nVERDICT: PASS, except secrets remain",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-caveat",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });

    it("honors an explicit VERDICT line", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-verdict", {
        phaseId: "acceptance-review-verdict",
        result: "Everything looks great.\nVERDICT: PASS",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-verdict",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when agent returns fail result", async () => {
      const cwd = createTempCwd();
      const mockAgent = new MockAgentRunner();
      mockAgent.setResponse("acceptance-review-fail", {
        phaseId: "acceptance-review-fail",
        result: "Review failed — issues found",
        success: true,
      });
      const runner = createRunner(cwd, { agentRunner: mockAgent });
      const result = await runSingle(runner, {
        id: "review-fail",
        type: "agent_review",
        prompt: "Review the changes",
        required: true,
      });
      expect(result.passed).toBe(false);
    });
  });
});
