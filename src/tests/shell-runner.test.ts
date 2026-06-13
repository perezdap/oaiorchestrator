import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { NodeShellRunner } from "../runners/shellRunner.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "shell-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("NodeShellRunner", () => {
  it("runs a simple command successfully", async () => {
    const cwd = createTempCwd();
    const runner = new NodeShellRunner({ enforcePolicy: false });
    const command = process.platform === "win32" ? "Write-Output hello" : "echo hello";
    const result = await runner.run({ command, cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain("hello");
  });

  it("blocks destructive commands when enforcePolicy is true", async () => {
    const cwd = createTempCwd();
    const runner = new NodeShellRunner({ enforcePolicy: true });
    const result = await runner.run({
      command: "git push origin main --force",
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("blocked by policy");
  });

  it("times out long-running commands", async () => {
    const cwd = createTempCwd();
    const runner = new NodeShellRunner({ enforcePolicy: false });
    const command =
      process.platform === "win32"
        ? "Start-Sleep -Seconds 5"
        : "sleep 5";
    const result = await runner.run({ command, cwd, timeoutMs: 500 });
    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain("timed out");
  });
});
