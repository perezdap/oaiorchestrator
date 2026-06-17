# Workflows

Workflows are YAML or JSON files validated by Zod (`workflow.schema.ts`).

## Minimal shape

```yaml
name: my-workflow
description: Optional description

inputs:
  task: string
  repoPath: string

agents:
  planner:
    type: planner
    model: auto
    instructions: |
      Custom instructions override type defaults.

phases:
  - id: plan
    agent: planner
    objective: Create a plan.
    outputs:
      - plan.md

acceptance:
  maxRetries: 2
  retryPhase: plan
  criteria:
    - id: plan-ready
      type: markdown_artifact
      path: plan.md
      required: true
```

## Phase fields

| Field | Description |
|-------|-------------|
| `id` | Unique phase identifier |
| `agent` | Key from `agents` map |
| `objective` | Prompt objective for the agent |
| `dependsOn` | Phase IDs that must complete first |
| `context` | Key/value strings added to agent context |
| `skills` | Extra skill ids merged after agent defaults for this phase |
| `inputs` | Expected input artifact names |
| `outputs` | Artifacts the phase should produce |
| `requiredArtifacts` | Alias for required outputs |
| `acceptance` | Phase-level acceptance checks |
| `maxRetries` | Per-phase agent retries |
| `onFailure` | `stop`, `skip`, `retry`, or `continue` |

## Example workflows

| File | Use case |
|------|----------|
| `generic-task.workflow.yaml` | Plan → implement → review → verify |
| `bug-fix.workflow.yaml` | Diagnose, fix, test, and verify a bug |
| `new-react-component.workflow.yaml` | Design, implement, test, and document a React component |
| `tdd-feature.workflow.yaml` | TDD: test-writer runs before implementer, retryPhase on failure |
| `safe-refactor.workflow.yaml` | Behaviour-preserving refactor with characterisation tests and review gates |
| `project-setup.workflow.yaml` | Node/TypeScript project scaffold with CI, Vitest, and docs |
| `security-audit.workflow.yaml` | Dependency scan, static audit, remediation plan, executive report |
| `api-integration.workflow.yaml` | Plan, implement, contract-test, review, and document a third-party API client |
| `winget-psadt-package.workflow.yaml` | Windows packaging with Pester |
| `repo-review.workflow.yaml` | Research and review pipeline |
| `research-installer.workflow.yaml` | Researcher proposes a download URL + SHA256 for a Windows installer; host-side acceptance criteria download the file, recompute the hash with `Get-FileHash`, check the Authenticode signature, and optionally run `$env:ORCH_VERIFY_SCRIPT` |

## Validation

```powershell
oaiorchestrator validate --workflow .\src\examples\generic-task.workflow.yaml
```

Validation checks:

- Unknown agent references
- Unknown phase dependencies
- Duplicate phase IDs
- Cyclic dependencies
- Schema shape for all nested objects

## Inputs at runtime

CLI flags and workflow `inputs` merge into run state:

```powershell
oaiorchestrator run -w .\workflow.yaml -t "Fix login bug" -r C:\repos\my-app
```

| Input / flag | Role |
|--------------|------|
| `task` / `-t` | Task description passed to agents |
| `repoPath` / `-r` | Local workspace root for policies, acceptance checks, and artifacts |

`repoPath` is the local checkout where agents are configured to run and where acceptance checks execute.
