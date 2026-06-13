import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { defaultPolicyGate } from "../policies/PolicyGate.js";
import { redactSecrets } from "../policies/redactionPolicy.js";

export class ArtifactStore {
  constructor(
    private readonly runDir: string,
    private readonly workspaceRoot: string,
  ) {
    mkdirSync(this.artifactsDir, { recursive: true });
  }

  get artifactsDir(): string {
    return join(this.runDir, "artifacts");
  }

  /**
   * Resolve an artifact name and require it to stay inside the artifacts
   * directory. Names are workflow/model-supplied, so a value like
   * "../../package.json" must not escape into the repository tree.
   */
  private resolveWithinArtifacts(relativeName: string): string {
    const root = resolve(this.artifactsDir);
    const fullPath = resolve(root, relativeName);
    const rel = relative(root, fullPath);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Artifact name escapes the artifacts directory: ${relativeName}`);
    }
    return fullPath;
  }

  writeArtifact(relativeName: string, content: string): string {
    const fullPath = this.resolveWithinArtifacts(relativeName);
    defaultPolicyGate.enforceFileAccess(
      fullPath,
      this.workspaceRoot,
      "write",
      "Artifact write blocked",
    );

    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, redactSecrets(content), "utf-8");
    return fullPath;
  }

  readArtifact(relativeName: string): string {
    const fullPath = this.resolveWithinArtifacts(relativeName);
    defaultPolicyGate.enforceFileAccess(
      fullPath,
      this.workspaceRoot,
      "read",
      "Artifact read blocked",
    );
    if (!existsSync(fullPath)) {
      throw new Error(`Artifact not found: ${relativeName}`);
    }
    return readFileSync(fullPath, "utf-8");
  }

  hasArtifact(relativeName: string): boolean {
    return existsSync(join(this.artifactsDir, relativeName));
  }

  copyExternalToArtifact(sourcePath: string, destName?: string): string {
    defaultPolicyGate.enforceFileAccess(
      sourcePath,
      this.workspaceRoot,
      "read",
      "External file copy blocked",
    );
    const dest = this.resolveWithinArtifacts(destName ?? basename(sourcePath));
    mkdirSync(resolve(dest, ".."), { recursive: true });
    copyFileSync(sourcePath, dest);
    return dest;
  }

  listArtifacts(): string[] {
    if (!existsSync(this.artifactsDir)) return [];
    return readdirSync(this.artifactsDir, { recursive: true }).map(String);
  }
}
