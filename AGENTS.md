# Agent Guide — oaiorchestrator

Instructions for AI coding agents and contributors working in this repository.

## What this project is

**oaiorchestrator** is a Windows-first framework for running multi-phase agent workflows against any OpenAI-compatible `/v1/chat/completions` endpoint (standard OpenAI, Azure OpenAI, xAI/Grok, custom gateways). Workflows are YAML/JSON files that define agents, phases, dependencies, and acceptance criteria. Each run persists state and artifacts under `.runs/<run-id>/`.

This repo is both the **framework** (TypeScript library + CLI) and a **reference implementation** for workflow-driven agent orchestration.

## Quick commands

```powershell
npm install
npm run build          # compile to dist/
npm run lint           # tsc --noEmit
npm test               # vitest run
npm run dev -- validate --workflow .\src\examples\generic-task.workflow.yaml
```

Live agent runs require `OPENAI_API_KEY` (endpoint override via `OPENAI_BASE_URL`). Use `--dry-run` or `MockAgentRunner` when you should not call the API. See `.env.example` for all variables.

## Repository layout

```text
skills/             # Bundled role and shared SKILL.md files (injected into prompts)
src/
  agents/           # Built-in agent type modules (planner, implementer, …)
  skills/           # SkillResolver, mergeSkillIds (loads skills/ at package root)
  cli.ts            # orchestrator CLI entry point
  index.ts          # Public library exports
  orchestrator/     # Orchestrator, Run, PhaseExecutor, PhaseRunner, TaskGraph, RunState, …
  orchestrator/acceptanceChecks/  # Per-type acceptance check handlers
  policies/         # commandPolicy, filePolicy, approvalPolicy
  runners/          # AgentRunner adapters (OpenAI-compatible, mock, shell)
  schemas/          # Zod schemas for workflow, agent, acceptance, task
  examples/         # Example workflow YAML files
  tests/            # Vitest unit tests
docs/               # Human-oriented deep dives
CONTEXT.md          # Domain glossary
.runs/              # Run artifacts (gitignored)
workflows/          # User workflows (created by `orchestrator init`)
```

## Architecture rules

1. **The orchestrator core must not import any LLM SDK or call LLM endpoints.** LLM access lives only in `src/runners/` (`OpenAiChatRunner`, optional `PiAgentRunner` via `oaiorchestrator/pi`).
2. **Agent execution goes through `AgentRunner`.** Inject `MockAgentRunner` in tests; never stub HTTP calls inside orchestrator code.
3. **Prompt assembly is centralized** in `PromptComposer.ts` (uses `composeAgentPrompt.ts` internally). Do not duplicate prompt-building logic in phase or acceptance code.
4. **Acceptance retry semantics** belong in `AcceptanceGate`. Phase-level and workflow-level acceptance share this module.
5. **Workflow validation** uses Zod schemas in `src/schemas/`. Extend schemas first, then handlers.

See [docs/architecture.md](docs/architecture.md) for the component diagram and extension table.

## Code conventions

| Topic | Convention |
|-------|------------|
| Language | TypeScript, ES modules (`"type": "module"`) |
| Module resolution | NodeNext — use `.js` extensions in relative imports |
| Strictness | `strict: true`, no unused locals/parameters |
| Tests | Vitest in `src/tests/*.test.ts` |
| Switch statements | Exhaustive handling with `never` in default case |
| Imports | Top of file only — no inline imports |
| Agent types | One file per type under `src/agents/*.agent.ts` |
| Schemas | Zod in `src/schemas/`; export parse helpers |

Match existing naming and file structure. Prefer extending built-in modules over parallel abstractions.

## Extension points

### Add an agent type

1. Create `src/agents/my-type.agent.ts` exporting an `AgentTypeModule`.
2. Add the type to `agentTypeSchema` in `src/schemas/agent.schema.ts`.
3. Register in `src/agents/index.ts` → `builtInAgentModules`.

No orchestrator changes required.

### Add an acceptance check type

1. Extend `acceptanceCheckSchema` in `src/schemas/acceptance.schema.ts`.
2. Add a handler in `src/orchestrator/acceptanceChecks/` and register it in `acceptanceChecks/index.ts`.
3. Add tests in `src/tests/acceptance-runner.test.ts`.

### Add an agent runner

Implement `AgentRunner` in `src/runners/` and wire it in `Orchestrator` runner selection. Optional SDK-heavy runners (for example `PiAgentRunner`) must export through a separate entry point (`src/pi.ts` → `oaiorchestrator/pi`) with peer dependencies so the default build stays SDK-free.

## Built-in agent types

| Type | Purpose |
|------|---------|
| `planner` | Decompose tasks; produce plan and acceptance docs |
| `implementer` | Focused code changes |
| `reviewer` | Quality and requirements review |
| `verifier` | Run checks against acceptance criteria |
| `researcher` | Gather and cite findings |
| `documenter` | Developer/operator documentation |
| `security-reviewer` | Security-focused audit |
| `test-writer` | Meaningful tests (Vitest, Pester) |
| `refactorer` | Structural improvements, no behavior change |
| `release-manager` | Versioning, changelog, packaging |

Details: [docs/agents.md](docs/agents.md).

## Windows-first defaults

- Shell runner uses **PowerShell 7+** (`pwsh`) on Windows.
- Document commands with Windows paths and PowerShell line continuation (backtick).
- Example workflows include winget/PSADT/Pester patterns.

Do not assume Unix-only tooling in docs or acceptance commands unless the workflow explicitly targets cross-platform use.

See [docs/windows-first.md](docs/windows-first.md).

## Safety and policies

Before adding destructive commands or broad file access:

- `commandPolicy` blocks risky git/filesystem commands by default.
- `filePolicy` prevents access outside the workspace root.
- `approvalPolicy` gates deletions, pushes, secrets, and manual checks.

When adding new automation paths, consider whether they need policy coverage.

## What to avoid

- Importing LLM SDKs or calling LLM endpoints outside `src/runners/`.
- Direct pushes to `main` — use a feature branch and pull request.
- Large unrelated refactors mixed with feature work.
- Tests that only assert mocks were called without verifying behavior.
- Inline imports or duplicated prompt/acceptance logic.
- Committing `.runs/`, secrets, or `.env` files.

## Pull request workflow

`main` is protected: changes require a PR. As the solo maintainer, you can merge your own PRs via owner bypass without an approval, but direct pushes to `main` are blocked.

```powershell
git checkout -b feature/my-change
# edit, commit
git push -u origin feature/my-change
gh pr create --fill
gh pr merge --squash
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

## Documentation map

| Doc | Audience | Contents |
|-----|----------|------------|
| [README.md](README.md) | Everyone | Install, CLI usage, quick reference |
| [AGENTS.md](AGENTS.md) | AI agents | This file — repo rules and layout |
| [CONTEXT.md](CONTEXT.md) | Everyone | Domain glossary |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Dev setup, PR process, testing |
| [docs/README.md](docs/README.md) | Everyone | Documentation index |
| [docs/getting-started.md](docs/getting-started.md) | New users | Tutorial-style first run |
| [docs/architecture.md](docs/architecture.md) | Contributors | Components and extension points |
| [docs/workflows.md](docs/workflows.md) | Workflow authors | YAML schema and examples |
| [docs/agents.md](docs/agents.md) | Workflow authors | Agent configuration |
| [docs/acceptance-criteria.md](docs/acceptance-criteria.md) | Workflow authors | Check types and retries |
| [docs/windows-first.md](docs/windows-first.md) | Contributors | Platform defaults |
| [docs/security.md](docs/security.md) | Operators | Endpoint trust, policies, host-side verification |

When changing behavior, update the relevant doc in the same PR.

## Testing expectations

- Run `npm test` and `npm run lint` before opening a PR.
- Add or update tests when changing orchestrator logic, schemas, policies, or runners.
- Use `MockAgentRunner` for tests that should not call LLM APIs.

## Domain vocabulary

Use terms from [CONTEXT.md](CONTEXT.md) consistently: **workflow**, **phase**, **run**, **agent**, **agent runner**, **acceptance gate**, **acceptance check**, **artifact**.
