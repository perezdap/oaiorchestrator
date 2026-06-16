# Documentation

Guide to oaiorchestrator documentation.

## Start here

| Document | Description |
|----------|-------------|
| [../README.md](../README.md) | Project overview, install, CLI reference |
| [getting-started.md](getting-started.md) | First workflow run, step by step |
| [../AGENTS.md](../AGENTS.md) | Guide for AI agents and contributors |
| [../CONTEXT.md](../CONTEXT.md) | Domain glossary |

## Core concepts

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Components, data flow, extension points |
| [error-recovery.md](error-recovery.md) | Failure classification, partial progress, resume |
| [workflows.md](workflows.md) | Workflow YAML schema and phase fields |
| [agents.md](agents.md) | Built-in agent types and configuration |
| [acceptance-criteria.md](acceptance-criteria.md) | Check types, retries, reports |
| [security.md](security.md) | Endpoint trust, host-side verification, policies |

## Platform

| Document | Description |
|----------|-------------|
| [windows-first.md](windows-first.md) | PowerShell defaults, paths, packaging examples |

## Contributing

| Document | Description |
|----------|-------------|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Dev setup, PR workflow, testing |

## Example workflows

Located in `src/examples/`:

| File | Use case |
|------|----------|
| `generic-task.workflow.yaml` | Plan → implement → review → verify |
| `winget-psadt-package.workflow.yaml` | Windows packaging with Pester |
| `repo-review.workflow.yaml` | Research and review pipeline |
| `research-installer.workflow.yaml` | Researcher proposes installer URL + SHA256; host downloads and verifies |

Validate any workflow:

```powershell
oaiorchestrator validate --workflow .\src\examples\generic-task.workflow.yaml
```

## Run artifacts

Each execution writes to `.runs/<run-id>/`:

```text
request.md              Task and inputs
workflow.yaml           Snapshot of workflow used
state.json              Resumable run state
phase-log.md            Human-readable phase log
agent-messages/         Per-phase agent transcripts
artifacts/              Phase outputs
acceptance-report.json  Machine-readable acceptance results
acceptance-report.md    Human-readable acceptance summary
final-report.md         Run summary
```
