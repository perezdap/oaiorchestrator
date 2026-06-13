import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseWorkflowContent,
  parseWorkflowFile,
  validateWorkflow,
  WorkflowValidationError,
} from "../schemas/workflow.schema.js";
import { createTempCwd } from "./helpers/tempDirs.js";

const validWorkflow = {
  name: "test-workflow",
  agents: {
    planner: {
      type: "planner",
      model: "auto",
      instructions: "Plan things",
    },
    implementer: {
      type: "implementer",
      model: "auto",
      instructions: "Build things",
    },
  },
  phases: [
    {
      id: "plan",
      agent: "planner",
      objective: "Plan",
      outputs: ["plan.md"],
    },
    {
      id: "build",
      agent: "implementer",
      objective: "Build",
      dependsOn: ["plan"],
    },
  ],
  acceptance: {
    maxRetries: 1,
    criteria: [
      {
        id: "file-check",
        type: "file_exists",
        path: "plan.md",
        required: true,
      },
    ],
  },
};

describe("workflow schema", () => {
  it("parses and validates a valid workflow", () => {
    const workflow = validateWorkflow(validWorkflow);
    expect(workflow.name).toBe("test-workflow");
    expect(workflow.phases).toHaveLength(2);
  });

  it("parses YAML workflow content", () => {
    const yaml = `
name: yaml-workflow
agents:
  planner:
    type: planner
    model: auto
    instructions: Plan
phases:
  - id: plan
    agent: planner
    objective: Plan work
`;
    const raw = parseWorkflowContent(yaml, "yaml");
    const workflow = validateWorkflow(raw);
    expect(workflow.name).toBe("yaml-workflow");
  });

  it("rejects workflow with unknown agent reference", () => {
    const invalid = {
      ...validWorkflow,
      phases: [
        {
          id: "bad",
          agent: "nonexistent",
          objective: "Fail",
        },
      ],
    };
    expect(() => validateWorkflow(invalid)).toThrow(WorkflowValidationError);
  });

  it("rejects phase ids that are unsafe as path segments", () => {
    const invalid = {
      ...validWorkflow,
      phases: [{ id: "..\\..\\README", agent: "planner", objective: "Escape" }],
    };
    expect(() => validateWorkflow(invalid)).toThrow(WorkflowValidationError);
  });

  it("rejects workflow with cyclic dependencies", () => {
    const invalid = {
      ...validWorkflow,
      phases: [
        { id: "a", agent: "planner", objective: "A", dependsOn: ["b"] },
        { id: "b", agent: "implementer", objective: "B", dependsOn: ["a"] },
      ],
    };
    expect(() => validateWorkflow(invalid)).toThrow(WorkflowValidationError);
  });

  it("rejects workflow with duplicate phase ids", () => {
    const invalid = {
      ...validWorkflow,
      phases: [
        { id: "plan", agent: "planner", objective: "Plan 1" },
        { id: "plan", agent: "planner", objective: "Plan 2" },
      ],
    };
    expect(() => validateWorkflow(invalid)).toThrow(WorkflowValidationError);
  });

  it("resolves workspace-local skills when workspaceRoot is provided", () => {
    const workspace = createTempCwd("workflow-workspace-skill-");
    mkdirSync(join(workspace, "skills", "my-local-skill"), { recursive: true });
    writeFileSync(
      join(workspace, "skills", "my-local-skill", "SKILL.md"),
      "---\nname: my-local-skill\ndescription: Local test skill\n---\n\n# My Local Skill\n",
      "utf-8",
    );

    const workflowYaml = [
      "name: workspace-skill-workflow",
      "agents:",
      "  planner:",
      "    type: planner",
      "    model: auto",
      "    instructions: Plan",
      "phases:",
      "  - id: plan",
      "    agent: planner",
      "    objective: Plan",
      "    skills:",
      "      - my-local-skill",
    ].join("\n");
    const workflowPath = join(workspace, "test.workflow.yaml");
    writeFileSync(workflowPath, workflowYaml, "utf-8");

    expect(() => parseWorkflowFile(workflowPath)).toThrow(WorkflowValidationError);

    const workflow = parseWorkflowFile(workflowPath, { workspaceRoot: workspace });
    expect(workflow.name).toBe("workspace-skill-workflow");
  });
});
