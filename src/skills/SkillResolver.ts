import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillMarkdown } from "./parseSkillMarkdown.js";

export interface ResolvedSkill {
  id: string;
  name: string;
  description?: string;
  body: string;
  source: "framework" | "workspace";
}

export interface SkillResolveOptions {
  workspaceRoot?: string;
}

export class SkillResolutionError extends Error {
  constructor(
    message: string,
    public readonly missingIds: string[],
  ) {
    super(message);
    this.name = "SkillResolutionError";
  }
}

export class SkillResolver {
  private readonly frameworkSkillsDir: string;
  private frameworkIdsCache: string[] | undefined;

  constructor(frameworkSkillsDir?: string) {
    this.frameworkSkillsDir = frameworkSkillsDir ?? getDefaultFrameworkSkillsDir();
  }

  listFrameworkSkillIds(): string[] {
    if (this.frameworkIdsCache) {
      return [...this.frameworkIdsCache];
    }

    if (!existsSync(this.frameworkSkillsDir)) {
      this.frameworkIdsCache = [];
      return [];
    }

    const ids = readdirSync(this.frameworkSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((id) => existsSync(join(this.frameworkSkillsDir, id, "SKILL.md")))
      .sort();

    this.frameworkIdsCache = ids;
    return [...ids];
  }

  findMissingIds(ids: string[], options: SkillResolveOptions = {}): string[] {
    const missing: string[] = [];

    for (const id of ids) {
      if (this.resolveFrameworkSkillPath(id)) {
        continue;
      }
      if (options.workspaceRoot && this.resolveWorkspaceSkillPath(options.workspaceRoot, id)) {
        continue;
      }
      missing.push(id);
    }

    return missing;
  }

  resolve(ids: string[], options: SkillResolveOptions = {}): ResolvedSkill[] {
    const missing = this.findMissingIds(ids, options);
    if (missing.length > 0) {
      throw new SkillResolutionError(
        `Unknown skill id(s): ${missing.join(", ")}`,
        missing,
      );
    }

    return ids.map((id) => this.loadSkill(id, options));
  }

  private loadSkill(id: string, options: SkillResolveOptions): ResolvedSkill {
    const frameworkPath = this.resolveFrameworkSkillPath(id);
    if (frameworkPath) {
      const content = readFileSync(frameworkPath, "utf-8");
      const parsed = parseSkillMarkdown(content, id);
      return {
        id,
        name: parsed.name,
        description: parsed.description,
        body: parsed.body,
        source: "framework",
      };
    }

    const workspaceRoot = options.workspaceRoot;
    if (!workspaceRoot) {
      throw new SkillResolutionError(`Unknown skill id: ${id}`, [id]);
    }

    const workspacePath = this.resolveWorkspaceSkillPath(workspaceRoot, id);
    if (!workspacePath) {
      throw new SkillResolutionError(`Unknown skill id: ${id}`, [id]);
    }

    const content = readFileSync(workspacePath, "utf-8");
    const parsed = parseSkillMarkdown(content, id);
    return {
      id,
      name: parsed.name,
      description: parsed.description,
      body: parsed.body,
      source: "workspace",
    };
  }

  private resolveFrameworkSkillPath(id: string): string | undefined {
    const path = join(this.frameworkSkillsDir, id, "SKILL.md");
    return existsSync(path) ? path : undefined;
  }

  private resolveWorkspaceSkillPath(workspaceRoot: string, id: string): string | undefined {
    const candidates = [
      join(workspaceRoot, "skills", id, "SKILL.md"),
      join(workspaceRoot, ".claude", "skills", id, "SKILL.md"),
      join(workspaceRoot, ".cursor", "skills", id, "SKILL.md"),
    ];
    return candidates.find((path) => existsSync(path));
  }
}

function getDefaultFrameworkSkillsDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "..", "skills");
}
