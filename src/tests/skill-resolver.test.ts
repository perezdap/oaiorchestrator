import { describe, expect, it } from "vitest";
import { mergeSkillIds } from "../skills/mergeSkillIds.js";
import { parseSkillMarkdown } from "../skills/parseSkillMarkdown.js";
import { SkillResolver, SkillResolutionError } from "../skills/SkillResolver.js";
import { validateWorkflow } from "../schemas/workflow.schema.js";

describe("mergeSkillIds", () => {
  it("deduplicates while preserving order", () => {
    expect(mergeSkillIds(["a", "b"], ["b", "c"], undefined)).toEqual(["a", "b", "c"]);
  });
});

describe("parseSkillMarkdown", () => {
  it("extracts frontmatter name and body", () => {
    const parsed = parseSkillMarkdown(
      "---\nname: my-skill\ndescription: test\n---\n\n# Body",
      "fallback",
    );
    expect(parsed.name).toBe("my-skill");
    expect(parsed.description).toBe("test");
    expect(parsed.body).toBe("# Body");
  });
});

describe("SkillResolver", () => {
  const resolver = new SkillResolver();

  it("lists bundled framework skills", () => {
    const ids = resolver.listFrameworkSkillIds();
    expect(ids).toContain("planner");
    expect(ids).toContain("windows-first");
  });

  it("resolves framework skills to markdown bodies", () => {
    const skills = resolver.resolve(["planner", "windows-first"]);
    expect(skills.length).toBe(2);
    expect(skills[0].source).toBe("framework");
    expect(skills[0].body.length).toBeGreaterThan(0);
  });

  it("throws for unknown skill ids", () => {
    expect(() => resolver.resolve(["not-a-real-skill"])).toThrow(SkillResolutionError);
  });
});

describe("validateWorkflow skills", () => {
  it("rejects unknown workflow skill references", () => {
    expect(() =>
      validateWorkflow({
        name: "bad-skills",
        agents: {
          planner: { type: "planner", model: "auto", instructions: "Plan" },
        },
        phases: [
          {
            id: "plan",
            agent: "planner",
            objective: "Plan",
            skills: ["nonexistent-skill"],
          },
        ],
      }),
    ).toThrow(/unknown skill/i);
  });

  it("accepts winget packaging skill on a phase", () => {
    const workflow = validateWorkflow({
      name: "packaging",
      agents: {
        planner: { type: "planner", model: "auto", instructions: "Plan" },
      },
      phases: [
        {
          id: "plan",
          agent: "planner",
          objective: "Plan packaging",
          skills: ["winget-psadt-package"],
        },
      ],
    });
    expect(workflow.phases[0].skills).toEqual(["winget-psadt-package"]);
  });
});
