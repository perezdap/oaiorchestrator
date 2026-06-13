import { execFileSync } from "node:child_process";

const GITHUB_HTTPS_PATTERN = /^https:\/\/github\.com\/[^/]+\/[^/]+$/i;

export class CloudRepoUrlRequiredError extends Error {
  constructor() {
    super(
      "Cloud mode requires a GitHub repository URL. Pass --repo-url (CLI) or repoUrl (library), or run against a git clone with origin configured.",
    );
    this.name = "CloudRepoUrlRequiredError";
  }
}

export class InvalidGitHubRepoUrlError extends Error {
  constructor(url: string) {
    super(`Cloud mode requires a GitHub repository URL (HTTPS). Got: ${url}`);
    this.name = "InvalidGitHubRepoUrlError";
  }
}

export function normalizeGitRemoteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const scpMatch = /^git@([^:]+):(.+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (scpMatch) {
    return `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  const sshUrlMatch = /^ssh:\/\/(?:git@)?([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/i, "").replace(/\.git$/i, "");
  }

  return trimmed;
}

function assertGitHubRepoUrl(url: string): string {
  if (!GITHUB_HTTPS_PATTERN.test(url)) {
    throw new InvalidGitHubRepoUrlError(url);
  }
  return url;
}

export function detectGitRemoteUrl(
  repoPath: string,
  remote = "origin",
): string | undefined {
  try {
    const output = execFileSync(
      "git",
      ["-C", repoPath, "remote", "get-url", remote],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const url = output.trim();
    return url ? assertGitHubRepoUrl(normalizeGitRemoteUrl(url)) : undefined;
  } catch (error) {
    if (error instanceof InvalidGitHubRepoUrlError) {
      throw error;
    }
    return undefined;
  }
}

export interface ResolveRunRepoUrlOptions {
  repoPath: string;
  executionMode: "local" | "cloud";
  repoUrl?: string;
}

export interface ResolveRunRepoUrlResult {
  repoUrl?: string;
  source?: "flag" | "git";
}

export function resolveRunRepoUrl(
  options: ResolveRunRepoUrlOptions,
): ResolveRunRepoUrlResult {
  if (options.executionMode !== "cloud") {
    return {};
  }

  if (options.repoUrl?.trim()) {
    return {
      repoUrl: assertGitHubRepoUrl(normalizeGitRemoteUrl(options.repoUrl)),
      source: "flag",
    };
  }

  const detected = detectGitRemoteUrl(options.repoPath);
  if (detected) {
    return { repoUrl: detected, source: "git" };
  }

  return {};
}
