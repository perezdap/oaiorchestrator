# Domain Glossary

Vocabulary for the oaiorchestrator framework. Use these terms in workflows, code, and docs.

## Workflow

A YAML/JSON definition of agents, phases, and acceptance criteria for a repeatable task pipeline.

## Phase

A single step in a workflow. Each phase assigns work to one agent, may depend on other phases, and can declare outputs and acceptance checks.

## Run

One execution of a workflow. Identified by a run ID and persisted under `.runs/<run-id>/`.

## Agent

A configured role (planner, implementer, reviewer, etc.) invoked through an agent runner. Workflow agents reference a built-in agent type plus optional overrides.

## Agent Runner

The seam where phase work is executed. Adapters include `OpenAiChatRunner` (any OpenAI-compatible `/v1/chat/completions` endpoint), `MockAgentRunner`, and future custom runners. Both `local` and `cloud` execution modes currently resolve to `OpenAiChatRunner`.

## Cloud repository URL (`repoUrl`)

GitHub HTTPS URL recorded in run context for cloud-mode runs. Resolved by `Orchestrator.run()` from the `repoUrl` input or auto-detected from `git remote get-url origin` on `repoPath`. Required when `executionMode` is `cloud`; non-GitHub remotes are rejected. Kept for workflow compatibility — cloud mode currently executes through the same `OpenAiChatRunner` as local.

## Acceptance Gate

The module that evaluates acceptance criteria with a retry policy and optional remediation between attempts. Produces a verdict and persisted reports.

## Acceptance Check

A single verifiable condition (command, file exists, agent review, etc.) evaluated by the acceptance runner.

## Artifact

A durable output file produced during a run, stored under `.runs/<run-id>/artifacts/`.
