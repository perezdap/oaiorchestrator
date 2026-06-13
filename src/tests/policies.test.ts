import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { ApprovalPolicy } from "../policies/approvalPolicy.js";
import {
  configureRedaction,
  evaluateCommand,
  redactSecrets,
  redactSecretsDeep,
} from "../policies/commandPolicy.js";
import {
  evaluateFileAccess,
  isWithinWorkspace,
  normalizePath,
} from "../policies/filePolicy.js";

describe("commandPolicy", () => {
  describe("evaluateCommand", () => {
    it("allows safe commands", () => {
      const result = evaluateCommand("Write-Output ok");
      expect(result.verdict).toBe("allow");
    });

    it("allows npm test", () => {
      const result = evaluateCommand("npm test");
      expect(result.verdict).toBe("allow");
    });

    it("blocks destructive git push --force", () => {
      const result = evaluateCommand("git push origin main --force");
      expect(result.verdict).toBe("block");
      expect(result.reason).toContain("Force push");
    });

    it("blocks Remove-Item -Recurse", () => {
      const result = evaluateCommand("Remove-Item -Path C:\\temp -Recurse");
      expect(result.verdict).toBe("block");
    });

    it("blocks rm -rf", () => {
      const result = evaluateCommand("rm -rf /tmp/data");
      expect(result.verdict).toBe("block");
    });

    it("requires approval for git push", () => {
      const result = evaluateCommand("git push origin main");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for .env access", () => {
      const result = evaluateCommand("Get-Content .env");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for secret-related commands", () => {
      const result = evaluateCommand("cat credentials.json");
      expect(result.verdict).toBe("require_approval");
    });

    it("allows risky commands when approval is disabled", () => {
      const result = evaluateCommand("git push origin main", {
        requireApprovalForRisky: false,
      });
      expect(result.verdict).toBe("allow");
    });
  });

  describe("redactSecrets", () => {
    afterEach(() => {
      configureRedaction({ enabled: true });
    });

    it("redacts GitHub personal access tokens", () => {
      const input = "token=ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      expect(redactSecrets(input)).toBe("token=[REDACTED]");
    });

    it("redacts OpenAI-style sk- keys", () => {
      const input = "key=sk-abcdefghijklmnopqrstuvwxyz";
      expect(redactSecrets(input)).toBe("key=[REDACTED]");
    });

    it("redacts Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9";
      expect(redactSecrets(input)).toBe("Authorization: [REDACTED]");
    });

    it("redacts cursor API keys", () => {
      const input = "cursor_api_key=cursor_abcdefghijklmnop";
      expect(redactSecrets(input)).toContain("[REDACTED]");
    });

    it("redacts OpenAI project-scoped keys (sk-proj-…)", () => {
      const input = "key sk-proj-abcDEF123ghiJKL456mnoPQR789stu in logs";
      const redacted = redactSecrets(input);
      expect(redacted).not.toContain("sk-proj-abcDEF123ghiJKL456mnoPQR789stu");
      expect(redacted).toContain("[REDACTED]");
    });

    it("skips redaction when disabled via configureRedaction", () => {
      const input = "token=ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      configureRedaction({ enabled: false });
      expect(redactSecrets(input)).toBe(input);
    });

    it("skips redaction when disabled per call", () => {
      const input = "token=ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      expect(redactSecrets(input, { enabled: false })).toBe(input);
    });
  });

  describe("redactSecretsDeep", () => {
    afterEach(() => {
      configureRedaction({ enabled: true });
    });

    it("redacts nested string values", () => {
      const input = {
        task: "deploy",
        config: { apiKey: "api_key=sk-abcdefghijklmnopqrstuvwxyz" },
        tags: ["Bearer eyJhbGciOiJIUzI1NiJ9"],
      };
      const result = redactSecretsDeep(input);
      expect(result.config.apiKey).toBe("[REDACTED]");
      expect(result.tags[0]).toBe("[REDACTED]");
      expect(result.task).toBe("deploy");
    });
  });
});

describe("filePolicy", () => {
  const workspace = mkdtempSync(join(tmpdir(), "filepolicy-workspace-"));
  const outsidePath = resolve(workspace, "..", "outside-workspace", "secret.txt");

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  describe("normalizePath", () => {
    it("resolves relative paths against workspace root", () => {
      const normalized = normalizePath("src/index.ts", workspace);
      expect(normalized).toContain("src");
      expect(normalized).toContain("index.ts");
    });
  });

  describe("isWithinWorkspace", () => {
    it("returns true for paths inside workspace", () => {
      expect(isWithinWorkspace("src/index.ts", workspace)).toBe(true);
    });

    it("returns false for paths outside workspace", () => {
      expect(isWithinWorkspace(outsidePath, workspace)).toBe(false);
    });
  });

  describe("evaluateFileAccess", () => {
    it("allows read access inside workspace", () => {
      const result = evaluateFileAccess("src/index.ts", workspace, "read");
      expect(result.verdict).toBe("allow");
    });

    it("blocks paths outside workspace", () => {
      const result = evaluateFileAccess(outsidePath, workspace, "read");
      expect(result.verdict).toBe("block");
    });

    it("blocks node_modules paths", () => {
      const result = evaluateFileAccess("node_modules/pkg/index.js", workspace, "write");
      expect(result.verdict).toBe("block");
    });

    it("blocks .git directory access", () => {
      const result = evaluateFileAccess(".git/config", workspace, "read");
      expect(result.verdict).toBe("block");
    });

    it("requires approval for .env files", () => {
      const result = evaluateFileAccess(".env", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for .env.local files", () => {
      const result = evaluateFileAccess(".env.local", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for .envrc files", () => {
      const result = evaluateFileAccess(".envrc", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for secrets.json", () => {
      const result = evaluateFileAccess("config/secrets.json", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for credentials.json", () => {
      const result = evaluateFileAccess("credentials.json", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for .npmrc", () => {
      const result = evaluateFileAccess(".npmrc", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for private key files", () => {
      const result = evaluateFileAccess("keys/server.key", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for .ssh directory paths", () => {
      const result = evaluateFileAccess(".ssh/config", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for secrets directory paths", () => {
      const result = evaluateFileAccess("config/secrets/vault.txt", workspace, "read");
      expect(result.verdict).toBe("require_approval");
    });

    it("requires approval for delete operations on normal files", () => {
      const result = evaluateFileAccess("src/old.ts", workspace, "delete");
      expect(result.verdict).toBe("require_approval");
    });
  });
});

describe("ApprovalPolicy", () => {
  it("auto-approves requests in test mode", () => {
    const policy = new ApprovalPolicy({ autoApproveInTests: true });
    const req = policy.requestManualApproval("Approve deploy", "deploy-check");
    expect(req.status).toBe("auto_approved");
    expect(policy.isApproved(req)).toBe(true);
  });

  it("creates pending requests without auto-approve", () => {
    const policy = new ApprovalPolicy({ autoApproveInTests: false });
    const req = policy.requestManualApproval("Approve deploy", "deploy-check");
    expect(req.status).toBe("pending");
    expect(policy.isApproved(req)).toBe(false);
  });

  it("grants approval when approve() is called", () => {
    const policy = new ApprovalPolicy({ autoApproveInTests: false });
    const req = policy.requestCommandApproval("git push", {
      verdict: "require_approval",
      reason: "Git push modifies remote state",
    });
    policy.approve(req.id);
    expect(policy.isApproved(req)).toBe(true);
  });

  it("auto-approves manual checks when configured", () => {
    const policy = new ApprovalPolicy({ autoApproveManualChecks: true });
    const req = policy.requestManualApproval("Review needed", "review-check");
    expect(req.status).toBe("auto_approved");
  });
});
