export type CommandPolicyVerdict = "allow" | "block" | "require_approval";

export interface CommandPolicyResult {
  verdict: CommandPolicyVerdict;
  reason: string;
  matchedPattern?: string;
}

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\s+.*--force\b/i, reason: "Force push is destructive" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "Hard reset is destructive" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/i, reason: "git clean -f removes untracked files" },
  { pattern: /\bRemove-Item\b.*-Recurse/i, reason: "Recursive Remove-Item can delete directories" },
  { pattern: /\brm\s+-rf\b/i, reason: "rm -rf is destructive" },
  { pattern: /\bdel\s+\/[sf]/i, reason: "del /s /f is destructive" },
  { pattern: /\bFormat-Volume\b/i, reason: "Format-Volume is destructive" },
  { pattern: /\bDROP\s+DATABASE\b/i, reason: "DROP DATABASE is destructive" },
  { pattern: /\bDROP\s+TABLE\b/i, reason: "DROP TABLE is destructive" },
];

const APPROVAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bRemove-Item\b/i, reason: "File deletion requires approval" },
  { pattern: /\bunlink\b/i, reason: "File deletion requires approval" },
  { pattern: /\bgit\s+push\b/i, reason: "Git push modifies remote state" },
  { pattern: /\.env\b/i, reason: "Secrets or credential files may be affected" },
  { pattern: /\bcredentials?\b/i, reason: "Credential access requires approval" },
  { pattern: /\bapi[_-]?key\b/i, reason: "API key access requires approval" },
  { pattern: /\bsecret\b/i, reason: "Secret access requires approval" },
];

export interface CommandPolicyOptions {
  blockDestructive?: boolean;
  requireApprovalForRisky?: boolean;
}

const DEFAULT_OPTIONS: Required<CommandPolicyOptions> = {
  blockDestructive: true,
  requireApprovalForRisky: true,
};

export function evaluateCommand(
  command: string,
  options: CommandPolicyOptions = {},
): CommandPolicyResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.blockDestructive) {
    for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        return { verdict: "block", reason, matchedPattern: pattern.source };
      }
    }
  }

  if (opts.requireApprovalForRisky) {
    for (const { pattern, reason } of APPROVAL_PATTERNS) {
      if (pattern.test(command)) {
        return { verdict: "require_approval", reason, matchedPattern: pattern.source };
      }
    }
  }

  return { verdict: "allow", reason: "Command permitted by policy" };
}

export {
  configureRedaction,
  getRedactionOptions,
  redactSecrets,
  redactSecretsDeep,
  type RedactionOptions,
} from "./redactionPolicy.js";
