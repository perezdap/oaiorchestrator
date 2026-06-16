# oaiorchestrator

Windows-first, OpenAI-compatible agent orchestration framework. Break almost any software task into phases, assign work to configurable agent types, enforce acceptance criteria, and produce durable artifacts under `.runs/<run-id>/`.

Works with any `/v1/chat/completions` endpoint: standard OpenAI, Azure OpenAI, xAI/Grok, or custom gateways.

## What it does

- Loads YAML/JSON **workflows** with phases, agents, and acceptance criteria
- Executes phases in **dependency order** using pluggable **agent runners**
- Talks to any **OpenAI-compatible endpoint** (without coupling the core to any LLM SDK)
- Runs **acceptance checks** host-side (shell commands, file checks, agent review, Pester/Vitest parsers, manual approval) — the LLM proposes, the host proves
- **Retries** failed acceptance and optional retry phases
- Persists **resumable run state** and artifacts for audit and debugging
- Enforces **command and file policies** for safer automation on Windows

## Install

```powershell
git clone https://github.com/perezdap/oaiorchestrator.git
cd oaiorchestrator
npm install
npm run build
```

Set your API key for live agent runs:

```powershell
$env:OPENAI_API_KEY = "sk-..."

# Optional: target a different endpoint or default model
$env:OPENAI_BASE_URL = "https://api.x.ai/v1"
$env:OPENAI_DEFAULT_MODEL = "grok-3"
```

`AI_REVIEW_TOKEN` and `AI_REVIEW_ENDPOINT` are accepted as fallbacks when the `OPENAI_*` variables are unset. See [`.env.example`](.env.example) for the full list.

## Initialize

```powershell
npx oaiorchestrator init
# or after linking:
oaiorchestrator init
```

This package intentionally exposes the `oaiorchestrator` command instead of `orchestrator` to avoid collisions with older CursorOrchestrator local links.

Creates `.orchestrator/config.yaml`, `.orchestrator/README.md`, `workflows/generic-task.workflow.yaml`, and `.runs/`.

Run from the **repository root**, not from inside `.orchestrator/`.

## Create a workflow

`init` seeds one starter template. To add workflows for your project:

1. Copy the starter and rename it:

```powershell
Copy-Item .\workflows\generic-task.workflow.yaml .\workflows\my-task.workflow.yaml
```

2. Edit agents, phases, dependencies, and acceptance criteria in the new file.

3. Validate before running:

```powershell
oaiorchestrator validate --workflow .\workflows\my-task.workflow.yaml
```

See [docs/workflows.md](docs/workflows.md) for the full schema and the [example workflow catalog](docs/workflows.md#example-workflows).

Bundled templates live under `src/examples/` in this repo, or `node_modules/oaiorchestrator/src/examples/` when installed as a package.

Validate any example before running:

```powershell
oaiorchestrator validate --workflow .\src\examples\tdd-feature.workflow.yaml
```

To use one as a starting point for your own workflow:

```powershell
Copy-Item .\src\examples\tdd-feature.workflow.yaml .\workflows\my-feature.workflow.yaml
```

When using the installed package, substitute the `node_modules/oaiorchestrator/src/examples/` path.

## Run a workflow

```powershell
oaiorchestrator validate --workflow .\src\examples\generic-task.workflow.yaml

oaiorchestrator run `
  --workflow .\src\examples\generic-task.workflow.yaml `
  --task "Add unit tests" `
  --repo-path .
```

Progress lines print to stderr by default (`[orchestrator] [1/4] Phase intake … running`). Use `--quiet` to suppress them.

Use `--dry-run` or `MockAgentRunner` in CI when you should not call the API.

Resume a run:

```powershell
oaiorchestrator resume --run-id <id> --repo-path .
```

List built-in agent types:

```powershell
oaiorchestrator list-agents
```

### Execution modes

`--execution-mode` accepts `local` (default) and `cloud`. Both currently use the same OpenAI-compatible runner — `cloud` is kept as an alias for workflow compatibility until a hosted variant exists. Acceptance checks (`npm test`, Pester, etc.) always run against `--repo-path` on your machine.

## Host-side verification

The model only returns text — it cannot run commands, download files, or write to your workspace. Everything security-critical happens as acceptance criteria executed by the host in PowerShell: hash checks, signature validation, test runs, file checks. See [`src/examples/research-installer.workflow.yaml`](src/examples/research-installer.workflow.yaml) for a complete example where a researcher proposes an installer URL + SHA256 and the host downloads and verifies it with `Get-FileHash` and `Get-AuthenticodeSignature` before the run can pass.

## Run artifacts

Each run creates:

```text
.runs/<run-id>/
  request.md
  workflow.yaml
  state.json
  phase-log.md
  agent-messages/
  artifacts/
  acceptance-report.json
  acceptance-report.md
  final-report.md
```

Expected phase outputs that the model emits as named fenced blocks (e.g. ```` ```json name=plan.json ````) are saved into `artifacts/` automatically.

## Add a new agent type

1. Create `src/agents/my-agent.agent.ts` exporting an `AgentTypeModule`
2. Register it in `src/agents/index.ts`
3. Reference the type in workflow YAML under `agents.<id>.type`

See [docs/agents.md](docs/agents.md).

## Add a new acceptance check

Extend `acceptanceCheckSchema` in `src/schemas/acceptance.schema.ts` and add a handler in `src/orchestrator/acceptanceChecks/`.

See [docs/acceptance-criteria.md](docs/acceptance-criteria.md).

## Architecture diagrams

High-level Mermaid diagrams live in [docs/architecture.md](docs/architecture.md):

- **Component map** — modules and dependencies (CLI through runners and policies)
- **Run lifecycle** — `Orchestrator` → `Run` → `PhaseExecutor` → `PhaseRunner` → `AcceptanceGate`
- **Phase dependency execution** — `dependsOn` ordering, resume skips, and the phase loop
- **Persistence and runner selection** — `.runs/<run-id>/` layout and `AgentRunner` wiring

Update those diagrams when you change orchestrator flow or persistence in the same PR.

## LLM integration

The orchestrator depends on the `AgentRunner` interface, not any LLM SDK:

```typescript
import { Orchestrator, MockAgentRunner } from "oaiorchestrator";

const orchestrator = new Orchestrator({
  agentRunner: new MockAgentRunner(), // or omit for OpenAiChatRunner
  executionMode: "local",
});
```

- `OpenAiChatRunner` — fetch-based client for any chat completions endpoint; extracts named artifact blocks from responses
- `composeAgentPrompt` / `PromptComposer` — centralized prompt assembly with skill injection
- `AcceptanceGate` — unified acceptance evaluation with retries
- `NodeShellRunner` — PowerShell-first shell execution for acceptance checks

Per-agent endpoint overrides are supported via the optional `baseUrl` field in agent config; per-agent models via `model` (`auto` resolves to `OPENAI_DEFAULT_MODEL` or `gpt-4o-mini`).

See [docs/architecture.md](docs/architecture.md).

## Programmatic usage

Use the library API directly when embedding orchestration in scripts, tests, or services. The bundled example runs a minimal workflow with `MockAgentRunner` — no API key required.

```powershell
npm run example:programmatic
```

Source: [`src/examples/programmatic-usage.example.ts`](src/examples/programmatic-usage.example.ts) (workflow: [`programmatic-usage.workflow.yaml`](src/examples/programmatic-usage.workflow.yaml)).

The example demonstrates:

- Loading a workflow with `parseWorkflowFile`
- Creating an `Orchestrator` with `MockAgentRunner`, `ApprovalPolicy`, and `NodeShellRunner`
- Calling `orchestrator.run()` and inspecting `RunWorkflowResult`
- Reading run artifacts under `.runs/<run-id>/`

Minimal pattern:

```typescript
import {
  ApprovalPolicy,
  MockAgentRunner,
  NodeShellRunner,
  Orchestrator,
  parseWorkflowFile,
} from "oaiorchestrator";

const workflow = parseWorkflowFile("./workflows/my-task.workflow.yaml");
const mockRunner = new MockAgentRunner();
mockRunner.setResponse("plan", {
  phaseId: "plan",
  result: "Done",
  artifacts: { "plan.md": "# Plan\n" },
});

const orchestrator = new Orchestrator({
  agentRunner: mockRunner,
  approvalPolicy: new ApprovalPolicy({ autoApproveManualChecks: true }),
  shellRunner: new NodeShellRunner({ enforcePolicy: false }),
});

const result = await orchestrator.run({
  workflow,
  inputs: { task: "My task", repoPath: process.cwd() },
});

console.log(result.status, result.runDir);
```

For live agents, omit `agentRunner` (defaults to `OpenAiChatRunner`) and set `OPENAI_API_KEY`.

Validation: `npm test` includes `programmatic-usage.example.test.ts`; run `npm run example:programmatic` for a manual smoke check.

## Migration from CursorOrchestrator

This project is a converted fork of CursorOrchestrator. If you used the original:

| Before | After |
|--------|-------|
| `CURSOR_API_KEY` | `OPENAI_API_KEY` (fallback `AI_REVIEW_TOKEN`) |
| `CursorLocalRunner` / `CursorCloudRunner` | `OpenAiChatRunner` |
| `runCursorAgent` export | removed |
| Cloud mode on Cursor-hosted VMs | alias for the local OpenAI runner |
| `@cursor/sdk` dependency | none — pure `fetch` |

## Development

```powershell
npm test
npm run build
npm run dev -- validate --workflow .\src\examples\generic-task.workflow.yaml
```

## Documentation

- [Getting started](docs/getting-started.md) — first workflow run
- [AGENTS.md](AGENTS.md) — guide for AI agents and contributors
- [Contributing](CONTRIBUTING.md) — dev setup and PR workflow
- [Documentation index](docs/README.md)

**Deep dives**

- [Architecture](docs/architecture.md)
- [Security](docs/security.md) — endpoint trust, policies, host-side verification
- [Workflows](docs/workflows.md)
- [Agents](docs/agents.md)
- [Acceptance criteria](docs/acceptance-criteria.md)
- [Windows-first design](docs/windows-first.md)
- [Domain glossary](CONTEXT.md)

## License

MIT
