import { spawn } from "node:child_process";
import { redactSecrets } from "../policies/commandPolicy.js";
import { defaultPolicyGate } from "../policies/PolicyGate.js";
import type { ShellRunner, ShellRunInput, ShellRunResult } from "./types.js";

export interface ShellRunnerOptions {
  enforcePolicy?: boolean;
  shell?: "powershell" | "cmd" | "default";
}

export class NodeShellRunner implements ShellRunner {
  readonly name = "node-shell";

  constructor(private readonly options: ShellRunnerOptions = {}) {}

  async run(input: ShellRunInput): Promise<ShellRunResult> {
    if (this.options.enforcePolicy !== false) {
      const blocked = defaultPolicyGate.enforceCommandForShell(input.command);
      if (blocked) {
        return blocked;
      }
    }

    const start = Date.now();
    const shell = this.resolveShell();

    return new Promise((resolve) => {
      const child = spawn(shell.executable, shell.args(input.command), {
        cwd: input.cwd,
        env: { ...process.env, ...input.env },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timeout = input.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, input.timeoutMs)
        : undefined;

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          exitCode: timedOut ? 124 : (code ?? 1),
          stdout: redactSecrets(stdout),
          stderr: redactSecrets(timedOut ? `${stderr}\nCommand timed out` : stderr),
          durationMs: Date.now() - start,
        });
      });

      child.on("error", (err) => {
        if (timeout) clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout: redactSecrets(stdout),
          stderr: redactSecrets(`${stderr}\n${err.message}`),
          durationMs: Date.now() - start,
        });
      });
    });
  }

  private resolveShell(): { executable: string; args: (cmd: string) => string[] } {
    const pref = this.options.shell ?? "default";
    if (pref === "powershell" || (pref === "default" && process.platform === "win32")) {
      return {
        executable: "pwsh",
        args: (cmd) => ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      };
    }
    if (pref === "cmd") {
      return {
        executable: "cmd.exe",
        args: (cmd) => ["/c", cmd],
      };
    }
    return {
      executable: process.platform === "win32" ? "pwsh" : "sh",
      args: (cmd) =>
        process.platform === "win32"
          ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
          : ["-c", cmd],
    };
  }
}
