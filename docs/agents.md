# Agents

## Built-in agent types

| Type | Role |
|------|------|
| `planner` | Decompose tasks, produce plan and acceptance docs |
| `implementer` | Make focused code changes |
| `reviewer` | Code review for quality and requirements |
| `verifier` | Run checks against acceptance criteria |
| `researcher` | Gather and cite findings |
| `documenter` | Write developer/operator documentation |
| `security-reviewer` | Security-focused audit |
| `test-writer` | Add meaningful tests (Vitest, Pester) |
| `refactorer` | Structural improvements without behavior change |
| `release-manager` | Versioning, changelog, packaging notes |

List types:

```powershell
oaiorchestrator list-agents
```

## Workflow agent configuration

Workflow YAML defines named agents that map to types:

```yaml
agents:
  planner:
    type: planner
    model: auto
    baseUrl: https://your-gateway.example.com/v1   # optional per-agent endpoint override
    instructions: |
      Override default planner instructions here.
    allowedTools:
      - read
      - write
    executionMode: local
```

Workflow `instructions` override built-in defaults. Other fields fall back to the type module.

- `model: auto` resolves to `$env:OPENAI_DEFAULT_MODEL` or `gpt-4o-mini`.
- `baseUrl` (optional) points a single agent at a different OpenAI-compatible endpoint; otherwise `$env:OPENAI_BASE_URL` (default `https://api.openai.com/v1`) is used.

## Default skills

Each agent type has bundled **skills** under `skills/<id>/SKILL.md` at the package root. Skills are procedure docs (outputs, checklists, constraints) injected into the agent prompt by `composeAgentPrompt`.

Merge order:

1. Agent type `defaultSkills` in `src/agents/*.agent.ts`
2. Workflow `agents.<id>.skills`
3. Phase `skills` for that step only

```yaml
agents:
  implementer:
    type: implementer
    model: auto
    instructions: |
      Make the requested changes.
    skills:
      - tdd   # workflow-only skill id (workspace or bundled)

phases:
  - id: verify
    agent: verifier
    objective: Run checks.
    skills:
      - run-smoke-tests
```

Workflow validation checks skill ids against bundled skills and, when `workspaceRoot` is provided, against workspace skills resolved in this order:

1. `<repo>/skills/<id>/SKILL.md`
2. `<repo>/.claude/skills/<id>/SKILL.md`
3. `<repo>/.cursor/skills/<id>/SKILL.md`

## Adding a new agent type

1. Create `src/agents/my-type.agent.ts`:

```typescript
import type { AgentTypeModule } from "./types.js";

export const myTypeAgent: AgentTypeModule = {
  type: "my-type", // extend agentTypeSchema enum first
  defaultInstructions: "You are a specialist for ...",
  outputs: ["result.md"],
  defaultSkills: ["my-type"],
};
```

2. Add the type to `agentTypeSchema` in `src/schemas/agent.schema.ts`
3. Export from `src/agents/index.ts` and add to `builtInAgentModules`
4. Add `skills/my-type/SKILL.md` for the default procedure doc

No orchestrator changes required.

## Execution modes

| Mode | Runner |
|------|--------|
| `local` | `OpenAiChatRunner` — calls the configured OpenAI-compatible endpoint; host workspace is `--repo-path` |
| `cloud` | `OpenAiChatRunner` — alias of `local`, kept for workflow compatibility until a hosted variant exists |
| `auto` | Follows workflow/run `executionMode` default |

Cloud runs still require a **GitHub** repository URL. `Orchestrator.run()` resolves `repoUrl` from run inputs or auto-detects `origin` from `repoPath` when `executionMode` is `cloud`; the CLI passes `--repo-url` through as `repoUrl`. Non-GitHub remotes are rejected. The resolved URL is passed to agents as `repoUrl` in run context.

See [security.md](security.md) for the threat model and endpoint trust guidance.

## Agent messages and artifacts

Each phase stores:

- `.runs/<id>/agent-messages/<phase-id>.md`
- `.runs/<id>/artifacts/<phase-id>-output.md`
- Declared `outputs` from the phase definition
