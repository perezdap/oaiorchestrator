# Getting Started

Run your first workflow in a few minutes on Windows.

## Prerequisites

- **Node.js 20+**
- **PowerShell 7+** (`pwsh`) — recommended on Windows
- **Git**
- **OpenAI-compatible API key** — only for live agent runs (optional for validation and dry runs)

## Install

```powershell
git clone git@github.com:perezdap/oaiorchestrator.git
cd oaiorchestrator
npm install
npm run build
```

Link the CLI globally (optional):

```powershell
npm link
```

## Configure the model endpoint (live runs only)

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

The default endpoint is `https://api.openai.com/v1`. Any OpenAI-compatible `/v1/chat/completions` endpoint works — Azure OpenAI, xAI/Grok, or a custom gateway:

```powershell
$env:OPENAI_BASE_URL = "https://your-gateway.example.com/v1"   # optional override
$env:OPENAI_DEFAULT_MODEL = "gpt-4o-mini"                       # used when agent config says model: auto
```

`OPENAI_BASE_URL` (and `AI_REVIEW_ENDPOINT`) accepts either a base URL or a full `/chat/completions` endpoint, including Azure-style `?api-version=...` query strings.

For **Azure OpenAI** key auth, point at your deployment endpoint and the runner automatically uses the `api-key` header for `*.azure.com` hosts:

```powershell
$env:OPENAI_BASE_URL = "https://my-res.openai.azure.com/openai/deployments/my-deploy/chat/completions?api-version=2024-02-01"
$env:OPENAI_API_KEY = "<azure-key>"
# Force the header style explicitly if needed: "bearer", "api-key", or "azure"
$env:OPENAI_AUTH_STYLE = "api-key"
```

`AI_REVIEW_TOKEN` and `AI_REVIEW_ENDPOINT` are accepted as fallbacks for the key and base URL. See `.env.example` at the repo root for the full list.

Without an API key you can still validate workflows and run with `--dry-run`.

## Cloud execution

`--execution-mode cloud` is currently an **alias** of the local OpenAI-compatible runner, kept for workflow compatibility until a hosted variant exists. Both modes execute through `OpenAiChatRunner` on your machine, and acceptance checks (`dotnet test`, `npm test`, etc.) always run locally against `--repo-path`.

Cloud mode still resolves and validates a **GitHub repository URL**, which is recorded in run context:

- **`--repo-url`** — optional explicit GitHub remote (HTTPS or SSH). Normalized to `https://github.com/org/repo`.
- **Auto-detect** — if `--repo-url` is omitted, `Orchestrator.run()` reads `git remote get-url origin` from `repoPath` and converts `git@github.com:org/repo.git` to HTTPS.
- **Failure** — cloud mode throws before phases start if no GitHub URL can be resolved (CLI and library callers share this path). Non-GitHub remotes (for example GitLab) are rejected.

```powershell
orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add CLI parsing tests" `
  --repo-path C:\path\to\your\repo `
  --repo-url https://github.com/org/repo `
  --execution-mode cloud
```

## Initialize a project

From the **repository root** (not from inside `.orchestrator/`):

```powershell
orchestrator init
```

Creates:

```text
.orchestrator/
  config.yaml       # Defaults for this repo
  README.md         # Layout and next steps
workflows/
  generic-task.workflow.yaml
.runs/              # Run artifacts (gitignore recommended)
```

Validate and run the starter workflow:

```powershell
orchestrator validate --workflow .\workflows\generic-task.workflow.yaml

orchestrator run `
  --workflow .\workflows\generic-task.workflow.yaml `
  --task "Your task" `
  --repo-path .
```

To add more workflows, copy `workflows/generic-task.workflow.yaml`, edit the copy, and validate it. See [workflows.md](workflows.md) for the schema and [README.md](../README.md#create-a-workflow) for examples you can copy from the package.

## Validate an example workflow

```powershell
orchestrator validate --workflow .\src\examples\generic-task.workflow.yaml
```

Validation checks schema shape, agent references, phase dependencies, and cycles.

## Dry run (no API calls)

Simulate execution without calling the model endpoint:

```powershell
orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add a hello world test" `
  --repo-path . `
  --dry-run
```

## Live run

```powershell
orchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add a hello world test" `
  --repo-path .
```

Progress prints to stderr:

```text
[orchestrator] [1/4] Phase intake … running
[orchestrator] [1/4] Phase intake … completed
...
```

On completion, inspect artifacts:

```powershell
Get-ChildItem .\.runs\
```

Each run folder contains `state.json`, `phase-log.md`, `artifacts/`, and acceptance reports.

## Resume a failed run

```powershell
orchestrator resume --run-id <id> --repo-path .
```

Completed phases are skipped; pending work continues from `state.json`.

## List built-in agents

```powershell
orchestrator list-agents
```

## Create your own workflow

1. Copy `workflows/generic-task.workflow.yaml` to `workflows/my-task.workflow.yaml`.
2. Adjust agents, phases, and acceptance criteria.
3. Validate, then run:

```powershell
orchestrator validate --workflow .\workflows\my-task.workflow.yaml

orchestrator run `
  --workflow .\workflows\my-task.workflow.yaml `
  --task "Your task description" `
  --repo-path .
```

See [workflows.md](workflows.md) for the full schema. For specialized templates (Windows packaging, repo review, installer research), copy from `node_modules/oaiorchestrator/src/examples/`.

## Migration from CursorOrchestrator

If you used this project when it was built on the Cursor SDK:

| Before | After |
|--------|-------|
| `CURSOR_API_KEY` | `OPENAI_API_KEY` (fallback: `AI_REVIEW_TOKEN`) |
| `CursorLocalRunner` / `CursorCloudRunner` | `OpenAiChatRunner` (exported from the package root) |
| Cloud mode on Cursor-hosted VMs | `cloud` is now an alias of the local OpenAI-compatible runner |

Workflow YAML, the `.runs/<run-id>/` layout, policies, resume, and acceptance criteria are unchanged.

## Next steps

- [workflows.md](workflows.md) — phase fields, dependencies, acceptance
- [agents.md](agents.md) — configure agent types and overrides
- [acceptance-criteria.md](acceptance-criteria.md) — verifiable completion checks
- [architecture.md](architecture.md) — how the framework fits together
- [../AGENTS.md](../AGENTS.md) — contributing and extending the framework
