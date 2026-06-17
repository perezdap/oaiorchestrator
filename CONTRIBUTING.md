# Contributing to oaiorchestrator

Thank you for contributing. This project uses pull requests for all changes to `main`.

## Branch protection

`main` is protected by a GitHub ruleset:

- Changes must go through a **pull request** (no direct pushes).
- **Code owner review** is required (`@perezdap` via `.github/CODEOWNERS`).
- Force pushes and branch deletion are blocked.

The repository owner can **merge without an approval** via ruleset bypass (`pull_request` mode). That supports solo development while keeping a PR audit trail.

## Development setup

```powershell
git clone <repository-url>
cd oaiorchestrator
npm install
npm run build
```

Optional — for live agent runs against an OpenAI-compatible endpoint:

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

See `.env.example` at the repo root for the full set of environment variables (`OPENAI_BASE_URL`, `OPENAI_DEFAULT_MODEL`, and compatibility fallbacks).

## Workflow for changes

```powershell
git checkout main
git pull origin main
git checkout -b feature/short-description

# make changes
npm run lint
npm test
npm run build

git add .
git commit -m "Brief summary of why, not just what"
git push -u origin feature/short-description

gh pr create --fill
gh pr merge --squash   # owner bypass skips approval requirement
```

Use descriptive branch names: `feature/…`, `fix/…`, `docs/…`.

## Commit messages

Write 1–2 sentences focused on **why** the change exists. Examples:

- `Add json_shape acceptance check for manifest validation`
- `Fix phase resume skipping failed acceptance retries`
- `Document AGENTS.md for AI contributor guidance`

Do not include AI attribution in commits or PR descriptions.

## Continuous integration

GitHub Actions runs on every push and pull request to `main` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- `npm ci` on Node.js 20 (Ubuntu)
- `npm run lint` — TypeScript type-check (`tsc --noEmit`)
- `npm run build` — compile to `dist/`
- `npm test` — Vitest unit tests
- Validate bundled example workflows under `src/examples/`

Run the same checks locally before opening a PR:

```powershell
npm run lint
npm run build
npm test
```

## Testing

```powershell
npm test               # fast suite (no live API calls)
npm run test:fast      # same as npm test
npm run test:full      # all tests, including live API integration
npm run test:sdk       # only live integration tests under src/tests/sdk/
npm run lint           # TypeScript type-check
npm run build          # compile check
```

### Fast vs full test runs

| Command | `OPENAI_API_KEY` | What runs |
|---------|------------------|-----------|
| `npm test` / `npm run test:fast` | Not required | Unit and integration tests using `MockAgentRunner` |
| `npm run test:full` | Required for live tests | Fast suite plus live API integration tests |
| `npm run test:sdk` | Required | Only live integration tests under `src/tests/sdk/` |

The default `npm test` excludes `src/tests/sdk/` so CI and local development stay fast and deterministic. Unit tests for the OpenAI runner (no live API) live in `src/tests/openai-runner.test.ts`; live integration tests live in `src/tests/sdk/`.

Shared test helpers under `src/tests/helpers/` provide isolated Orchestrator instances:

- `createTestOrchestrator()` — wires `MockAgentRunner`, permissive shell policy, and auto-approved manual checks.
- `configureMockRunnerForWorkflowPhases()` — seeds phase responses for workflow runs.
- `createTempCwd()` — temp workspace with automatic cleanup via `vitest.setup.ts`.

When adding features:

- **Schemas** — add validation tests in `src/tests/*.schema.test.ts` or adjacent test files.
- **Orchestrator behavior** — use `createTestOrchestrator()` and `MockAgentRunner`; do not call a live endpoint in the default suite.
- **Acceptance checks** — cover new check types in `acceptance-runner.test.ts`.
- **Live API coverage** — add tests under `src/tests/sdk/` and run with `npm run test:sdk` or `npm run test:full`.

Validate example workflows still parse:

```powershell
npm run dev -- validate --workflow .\src\examples\generic-task.workflow.yaml
```

## Code style

- TypeScript strict mode; ESM with `.js` import extensions.
- Imports at the top of the file.
- Exhaustive `switch` defaults with `never` for discriminated unions.
- Keep changes focused — avoid drive-by refactors.

AI agents working in this repo should read [AGENTS.md](AGENTS.md) first.

## Documentation

Update docs when you change user-visible behavior:

| Change | Update |
|--------|--------|
| CLI commands or flags | README.md, docs/getting-started.md |
| Workflow schema | docs/workflows.md |
| Agent types | docs/agents.md, AGENTS.md |
| Acceptance check types | docs/acceptance-criteria.md |
| Architecture / extension points | docs/architecture.md, AGENTS.md |
| Domain terms | CONTEXT.md |

## Project layout for contributors

```text
src/agents/         Add agent types here
src/schemas/        Zod schemas — change first when extending models
src/orchestrator/   Core execution engine
src/runners/        OpenAI-compatible chat runner, mock runner, shell runner
src/policies/       Safety policies
src/tests/          Vitest tests
src/examples/       Reference workflow YAML
docs/               Deep-dive documentation
```

## Questions

Open an issue or discussion on GitHub for design questions before large changes.
