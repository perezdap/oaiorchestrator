import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { builtInAgentModules } from "../agents/index.js";
import { mergeSkillIds } from "../skills/mergeSkillIds.js";
import { SkillResolver } from "../skills/SkillResolver.js";
import { agentConfigSchema } from "./agent.schema.js";
import { acceptanceConfigSchema } from "./acceptance.schema.js";
import { collectWorkflowMcpValidationIssues, workflowMcpAllowlistSchema } from "./mcpAllowlist.js";
import { phaseSchema } from "./task.schema.js";

export const workflowSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().optional(),
    inputs: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    agents: z.record(agentConfigSchema),
    mcpServers: workflowMcpAllowlistSchema.optional(),
    phases: z.array(phaseSchema).min(1),
    acceptance: acceptanceConfigSchema.optional(),
  })
  .superRefine((workflow, ctx) => {
    const agentIds = new Set(Object.keys(workflow.agents));
    const phaseIds = new Set<string>();

    for (const phase of workflow.phases) {
      if (phaseIds.has(phase.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate phase id: ${phase.id}`,
          path: ["phases"],
        });
      }
      phaseIds.add(phase.id);

      if (!agentIds.has(phase.agent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Phase "${phase.id}" references unknown agent "${phase.agent}"`,
          path: ["phases"],
        });
      }

      for (const dep of phase.dependsOn) {
        if (!phaseIds.has(dep) && !workflow.phases.some((p) => p.id === dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Phase "${phase.id}" depends on unknown phase "${dep}"`,
            path: ["phases"],
          });
        }
      }
    }

    const hasCycle = detectPhaseCycle(workflow.phases.map((p) => ({ id: p.id, dependsOn: p.dependsOn })));
    if (hasCycle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phase dependency graph contains a cycle",
        path: ["phases"],
      });
    }
  });

export type Workflow = z.infer<typeof workflowSchema>;

export class WorkflowValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

export function parseWorkflowContent(content: string, format: "yaml" | "json"): unknown {
  if (format === "yaml") {
    return parseYaml(content);
  }
  return JSON.parse(content) as unknown;
}

export function parseWorkflowFile(
  filePath: string,
  options: ValidateWorkflowOptions = {},
): Workflow {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();
  const format = ext === ".json" ? "json" : "yaml";
  const raw = parseWorkflowContent(content, format);
  return validateWorkflow(raw, options);
}

export interface ValidateWorkflowOptions {
  workspaceRoot?: string;
  skillResolver?: SkillResolver;
}

export function validateWorkflow(raw: unknown, options: ValidateWorkflowOptions = {}): Workflow {
  const result = workflowSchema.safeParse(raw);
  if (!result.success) {
    throw new WorkflowValidationError(
      `Invalid workflow: ${result.error.issues.map((i) => i.message).join("; ")}`,
      result.error.issues,
    );
  }

  validateWorkflowSkills(result.data, options);
  validateWorkflowMcpServers(result.data);
  return result.data;
}

function validateWorkflowMcpServers(workflow: Workflow): void {
  const issues = collectWorkflowMcpValidationIssues(workflow);
  if (issues.length === 0) {
    return;
  }

  throw new WorkflowValidationError(`Invalid workflow: ${issues.join("; ")}`, [
    {
      code: z.ZodIssueCode.custom,
      message: issues.join("; "),
      path: ["mcpServers"],
    },
  ]);
}

function validateWorkflowSkills(workflow: Workflow, options: ValidateWorkflowOptions): void {
  const typeDefaultSkills = new Map(
    builtInAgentModules.map((module) => [module.type, module.defaultSkills ?? []]),
  );
  const skillIds = new Set<string>();

  for (const agent of Object.values(workflow.agents)) {
    const defaults = typeDefaultSkills.get(agent.type) ?? [];
    for (const id of mergeSkillIds(defaults, agent.skills)) {
      skillIds.add(id);
    }
  }

  for (const phase of workflow.phases) {
    for (const id of phase.skills ?? []) {
      skillIds.add(id);
    }
  }

  if (skillIds.size === 0) {
    return;
  }

  const resolver = options.skillResolver ?? new SkillResolver();
  const missing = resolver.findMissingIds([...skillIds], {
    workspaceRoot: options.workspaceRoot,
  });

  if (missing.length > 0) {
    throw new WorkflowValidationError(
      `Invalid workflow: unknown skill id(s): ${missing.join(", ")}`,
      [
        {
          code: z.ZodIssueCode.custom,
          message: `Unknown skill id(s): ${missing.join(", ")}`,
          path: ["skills"],
        },
      ],
    );
  }
}

function detectPhaseCycle(phases: Array<{ id: string; dependsOn: string[] }>): boolean {
  const graph = new Map(phases.map((p) => [p.id, p.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const phase of phases) {
    if (dfs(phase.id)) return true;
  }
  return false;
}
