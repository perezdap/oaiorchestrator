import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  detectGitRemoteUrl,
  InvalidGitHubRepoUrlError,
  normalizeGitRemoteUrl,
  resolveRunRepoUrl,
} from "../util/resolveRepoUrl.js";

describe("normalizeGitRemoteUrl", () => {
  it("converts scp-style GitHub SSH remotes to HTTPS", () => {
    expect(normalizeGitRemoteUrl("git@github.com:perezdap/example.git")).toBe(
      "https://github.com/perezdap/example",
    );
  });

  it("converts ssh:// remotes to HTTPS", () => {
    expect(normalizeGitRemoteUrl("ssh://git@github.com/perezdap/repo.git")).toBe(
      "https://github.com/perezdap/repo",
    );
  });

  it("converts ssh:// remotes without git@ to HTTPS", () => {
    expect(normalizeGitRemoteUrl("ssh://github.com/perezdap/repo.git")).toBe(
      "https://github.com/perezdap/repo",
    );
  });

  it("strips .git from HTTPS remotes", () => {
    expect(normalizeGitRemoteUrl("https://github.com/perezdap/example.git")).toBe(
      "https://github.com/perezdap/example",
    );
  });

  it("preserves HTTPS remotes without .git suffix", () => {
    expect(normalizeGitRemoteUrl("https://github.com/perezdap/repo")).toBe(
      "https://github.com/perezdap/repo",
    );
  });

  it("strips trailing slashes from HTTPS remotes", () => {
    expect(normalizeGitRemoteUrl("https://github.com/perezdap/repo/")).toBe(
      "https://github.com/perezdap/repo",
    );
  });

  it("strips both .git suffix and trailing slash from HTTPS remotes", () => {
    expect(normalizeGitRemoteUrl("https://github.com/perezdap/repo.git/")).toBe(
      "https://github.com/perezdap/repo",
    );
  });
});

describe("detectGitRemoteUrl", () => {
  it("reads origin from a git repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-repo-url-"));
    try {
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync(
        "git",
        ["remote", "add", "origin", "git@github.com:example/project.git"],
        { cwd: dir },
      );

      expect(detectGitRemoteUrl(dir)).toBe("https://github.com/example/project");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-GitHub remotes", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-repo-url-"));
    try {
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync(
        "git",
        ["remote", "add", "origin", "https://gitlab.com/example/project.git"],
        { cwd: dir },
      );

      expect(() => detectGitRemoteUrl(dir)).toThrow(InvalidGitHubRepoUrlError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveRunRepoUrl", () => {
  it("prefers an explicit repo URL flag in cloud mode", () => {
    const result = resolveRunRepoUrl({
      repoPath: process.cwd(),
      executionMode: "cloud",
      repoUrl: "https://github.com/perezdap/custom.git",
    });

    expect(result).toEqual({
      repoUrl: "https://github.com/perezdap/custom",
      source: "flag",
    });
  });

  it("auto-detects origin for cloud mode when no flag is passed", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-resolve-url-"));
    try {
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync(
        "git",
        ["remote", "add", "origin", "git@github.com:example/auto-detect.git"],
        { cwd: dir },
      );

      const result = resolveRunRepoUrl({
        repoPath: dir,
        executionMode: "cloud",
      });

      expect(result).toEqual({
        repoUrl: "https://github.com/example/auto-detect",
        source: "git",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores repo URL for local mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-local-url-"));
    try {
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync(
        "git",
        ["remote", "add", "origin", "git@github.com:example/local.git"],
        { cwd: dir },
      );

      expect(
        resolveRunRepoUrl({
          repoPath: dir,
          executionMode: "local",
        }),
      ).toEqual({});

      expect(
        resolveRunRepoUrl({
          repoPath: dir,
          executionMode: "local",
          repoUrl: "https://github.com/example/local.git",
        }),
      ).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-GitHub explicit repo URLs in cloud mode", () => {
    expect(() =>
      resolveRunRepoUrl({
        repoPath: process.cwd(),
        executionMode: "cloud",
        repoUrl: "https://gitlab.com/example/project.git",
      }),
    ).toThrow(InvalidGitHubRepoUrlError);
  });
});
