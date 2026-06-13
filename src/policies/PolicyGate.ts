import {
  evaluateCommand,
  type CommandPolicyOptions,
  type CommandPolicyResult,
  type CommandPolicyVerdict,
} from "./commandPolicy.js";
import {
  evaluateFileAccess,
  type FilePolicyResult,
  type FilePolicyVerdict,
} from "./filePolicy.js";

export type FileOperation = "read" | "write" | "delete";

export interface CommandPolicyEvaluation {
  verdict: CommandPolicyVerdict;
  allowed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  reason: string;
  matchedPattern?: string;
}

export interface FilePolicyEvaluation {
  verdict: FilePolicyVerdict;
  allowed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  reason: string;
  normalizedPath: string;
}

export interface CommandAcceptanceBlock {
  passed: false;
  message: string;
}

export interface ShellCommandBlock {
  exitCode: 1;
  stdout: "";
  stderr: string;
  durationMs: 0;
}

export interface PolicyGateOptions {
  command?: CommandPolicyOptions;
}

function fromCommandResult(result: CommandPolicyResult): CommandPolicyEvaluation {
  return {
    verdict: result.verdict,
    allowed: result.verdict === "allow",
    blocked: result.verdict === "block",
    requiresApproval: result.verdict === "require_approval",
    reason: result.reason,
    matchedPattern: result.matchedPattern,
  };
}

function fromFileResult(result: FilePolicyResult): FilePolicyEvaluation {
  return {
    verdict: result.verdict,
    allowed: result.verdict === "allow",
    blocked: result.verdict === "block",
    requiresApproval: result.verdict === "require_approval",
    reason: result.reason,
    normalizedPath: result.normalizedPath,
  };
}

export class PolicyGate {
  constructor(private readonly options: PolicyGateOptions = {}) {}

  evaluateCommand(command: string): CommandPolicyEvaluation {
    return fromCommandResult(evaluateCommand(command, this.options.command));
  }

  evaluateFile(
    filePath: string,
    workspaceRoot: string,
    operation: FileOperation = "read",
  ): FilePolicyEvaluation {
    return fromFileResult(evaluateFileAccess(filePath, workspaceRoot, operation));
  }

  enforceCommandForShell(command: string): ShellCommandBlock | null {
    const evaluation = this.evaluateCommand(command);
    if (!evaluation.blocked) {
      return null;
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Command blocked by policy: ${evaluation.reason}`,
      durationMs: 0,
    };
  }

  enforceCommandForAcceptance(command: string): CommandAcceptanceBlock | null {
    const evaluation = this.evaluateCommand(command);
    if (!evaluation.blocked) {
      return null;
    }
    return {
      passed: false,
      message: `Command blocked: ${evaluation.reason}`,
    };
  }

  enforceFileAccess(
    filePath: string,
    workspaceRoot: string,
    operation: FileOperation,
    blockReasonPrefix = "File access blocked",
  ): void {
    const evaluation = this.evaluateFile(filePath, workspaceRoot, operation);
    if (evaluation.blocked) {
      throw new Error(`${blockReasonPrefix}: ${evaluation.reason}`);
    }
  }
}

export const defaultPolicyGate = new PolicyGate();
