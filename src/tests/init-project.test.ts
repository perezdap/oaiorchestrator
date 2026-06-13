import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { formatInitSummary, initProject } from "../init/initProject.js";

const moduleUrl = import.meta.url;

describe("initProject", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "orchestrator-init-"));
    tempDirs.push(dir);
    return dir;
  }

  it("creates config, readme, workflows, and runs directory at project root", () => {
    const projectRoot = makeTempDir();
    const result = initProject(projectRoot, moduleUrl);

    expect(result.projectRoot).toBe(projectRoot);
    expect(result.adjustedFromOrchestratorDir).toBe(false);
    expect(result.created).toEqual([
      ".orchestrator/config.yaml",
      ".orchestrator/README.md",
      "workflows/generic-task.workflow.yaml",
    ]);
    expect(readFileSync(join(projectRoot, ".orchestrator/config.yaml"), "utf-8")).toContain(
      "defaultExecutionMode: local",
    );
    expect(readFileSync(join(projectRoot, "workflows/generic-task.workflow.yaml"), "utf-8")).toContain(
      "name: generic-task",
    );
  });

  it("uses parent directory when init is run from .orchestrator", () => {
    const projectRoot = makeTempDir();
    const orchestratorDir = join(projectRoot, ".orchestrator");
    mkdirSync(orchestratorDir, { recursive: true });

    const result = initProject(orchestratorDir, moduleUrl);

    expect(result.projectRoot).toBe(projectRoot);
    expect(result.adjustedFromOrchestratorDir).toBe(true);
    expect(result.created).toContain(".orchestrator/config.yaml");
  });

  it("skips files that already exist", () => {
    const projectRoot = makeTempDir();
    initProject(projectRoot, moduleUrl);
    const second = initProject(projectRoot, moduleUrl);

    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([
      ".orchestrator/config.yaml",
      ".orchestrator/README.md",
      "workflows/generic-task.workflow.yaml",
    ]);
  });

  it("formatInitSummary points at workflows in the consumer project", () => {
    const summary = formatInitSummary({
      projectRoot: "C:\\repo",
      adjustedFromOrchestratorDir: false,
      created: [".orchestrator/config.yaml"],
      skipped: [],
    });

    expect(summary).toContain(".\\workflows\\generic-task.workflow.yaml");
    expect(summary).not.toContain(".\\src\\examples\\");
  });
});
