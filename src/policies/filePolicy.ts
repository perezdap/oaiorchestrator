import { resolve, relative, isAbsolute, normalize } from "node:path";

export type FilePolicyVerdict = "allow" | "block" | "require_approval";

export interface FilePolicyResult {
  verdict: FilePolicyVerdict;
  reason: string;
  normalizedPath: string;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string; verdict: FilePolicyVerdict }> = [
  { pattern: /\.env(\.|$)/i, reason: ".env files may contain secrets", verdict: "require_approval" },
  { pattern: /\.envrc$/i, reason: ".envrc files may contain secrets", verdict: "require_approval" },
  { pattern: /[/\\]secrets?[/\\]/i, reason: "Secrets directories require approval", verdict: "require_approval" },
  { pattern: /secrets?\.json$/i, reason: "Secret JSON files require approval", verdict: "require_approval" },
  { pattern: /credentials?\.json$/i, reason: "Credential files require approval", verdict: "require_approval" },
  { pattern: /aws[_-]?credentials$/i, reason: "AWS credential files require approval", verdict: "require_approval" },
  { pattern: /\.npmrc$/i, reason: ".npmrc may contain registry tokens", verdict: "require_approval" },
  { pattern: /\.htpasswd$/i, reason: "htpasswd files contain credentials", verdict: "require_approval" },
  { pattern: /passwords?\.(txt|json|ya?ml)$/i, reason: "Password files require approval", verdict: "require_approval" },
  { pattern: /\.pem$/i, reason: "Private key files require approval", verdict: "require_approval" },
  { pattern: /\.key$/i, reason: "Private key files require approval", verdict: "require_approval" },
  { pattern: /\.p12$/i, reason: "Certificate/key stores require approval", verdict: "require_approval" },
  { pattern: /\.pfx$/i, reason: "Certificate/key stores require approval", verdict: "require_approval" },
  { pattern: /id_(rsa|dsa|ed25519)/i, reason: "SSH keys require approval", verdict: "require_approval" },
  { pattern: /[/\\]\.ssh[/\\]/i, reason: ".ssh directory requires approval", verdict: "require_approval" },
  { pattern: /[/\\]\.kube[/\\]config$/i, reason: "Kubeconfig may contain cluster credentials", verdict: "require_approval" },
  { pattern: /node_modules/i, reason: "node_modules should not be modified by agents", verdict: "block" },
  { pattern: /\.git[\\/]/i, reason: "Direct .git manipulation is blocked", verdict: "block" },
];

export function normalizePath(filePath: string, workspaceRoot: string): string {
  const resolved = isAbsolute(filePath)
    ? normalize(filePath)
    : normalize(resolve(workspaceRoot, filePath));
  return resolved;
}

export function isWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolved = normalizePath(filePath, workspaceRoot);
  const root = normalize(resolve(workspaceRoot));
  const rel = relative(root, resolved);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export function evaluateFileAccess(
  filePath: string,
  workspaceRoot: string,
  operation: "read" | "write" | "delete" = "read",
): FilePolicyResult {
  const normalizedPath = normalizePath(filePath, workspaceRoot);

  if (!isWithinWorkspace(filePath, workspaceRoot)) {
    return {
      verdict: "block",
      reason: `Path "${filePath}" is outside workspace "${workspaceRoot}"`,
      normalizedPath,
    };
  }

  for (const { pattern, reason, verdict } of SENSITIVE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      if (operation === "delete" && verdict !== "block") {
        return { verdict: "require_approval", reason: `Delete of sensitive path: ${reason}`, normalizedPath };
      }
      return { verdict, reason, normalizedPath };
    }
  }

  if (operation === "delete") {
    return {
      verdict: "require_approval",
      reason: "File deletion requires approval",
      normalizedPath,
    };
  }

  return { verdict: "allow", reason: "File access permitted", normalizedPath };
}
