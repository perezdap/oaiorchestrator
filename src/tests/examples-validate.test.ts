import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExamplesDir } from "../init/resolveExamplesDir.js";
import { parseWorkflowFile } from "../schemas/workflow.schema.js";

const examplesDir = resolveExamplesDir(import.meta.url);

function listExampleWorkflows(): string[] {
  return readdirSync(examplesDir)
    .filter((name) => name.endsWith(".workflow.yaml"))
    .sort();
}

describe("bundled example workflows", () => {
  const workflows = listExampleWorkflows();

  it("discovers at least one example workflow", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it.each(workflows)("%s validates without schema errors", (fileName) => {
    const workflow = parseWorkflowFile(join(examplesDir, fileName));
    expect(workflow.name.length).toBeGreaterThan(0);
    expect(workflow.phases.length).toBeGreaterThan(0);
  });
});
