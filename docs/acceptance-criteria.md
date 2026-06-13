# Acceptance Criteria

Acceptance criteria are the host-side proof step: the LLM only returns text — it cannot execute commands or write files — so every claim is verified on your machine through these checks (shell commands via `pwsh`, test parsers, file checks, manual approval). The LLM proposes; the host proves.

Acceptance checks run after all phases complete (workflow-level) or after individual phases (phase-level). Results are written to:

```text
.runs/<run-id>/acceptance-report.json
.runs/<run-id>/acceptance-report.md
```

## Workflow acceptance config

```yaml
acceptance:
  maxRetries: 3
  retryPhase: implement
  criteria:
    - id: unique-id
      type: command
      command: npm test
      required: true
```

When checks fail, the orchestrator retries up to `maxRetries` times. If `retryPhase` is set, that phase re-runs before the next acceptance attempt.

## Check types

### `command`

Runs a shell command (PowerShell on Windows by default).

```yaml
- id: tests-pass
  type: command
  command: pwsh -NoProfile -Command "Invoke-Pester"
  cwd: .
  timeoutMs: 120000
  required: true
```

The command environment includes `$env:ORCH_RUN_ID` and `$env:ORCH_ARTIFACTS_DIR` for the active run, so checks can read this run's artifacts deterministically instead of scanning `.runs/`:

```yaml
- id: research-valid
  type: command
  command: |
    $json = Join-Path $env:ORCH_ARTIFACTS_DIR 'installer-research.json'
    if (-not (Test-Path $json)) { exit 1 }
```

See `src/examples/research-installer.workflow.yaml` for a complete example.

### `file_exists`

```yaml
- id: manifest
  type: file_exists
  path: winget-manifest.yaml
```

### `file_contains`

```yaml
- id: version-bump
  type: file_contains
  path: package.json
  pattern: '"version": "2\\.0\\.0"'
```

### `json_shape`

Lightweight key/type shape validation (not full JSON Schema). Checks that top-level keys exist and optional string type hints match.

```yaml
- id: state-valid
  type: json_shape
  path: .runs/current/state.json
  schema:
    runId: string
    status: string
```

### `markdown_artifact`

Checks artifacts directory or workspace for a markdown file with minimum length.

```yaml
- id: plan-exists
  type: markdown_artifact
  path: plan.md
  minLength: 10
```

### `agent_review`

Delegates to an `AgentRunner` with a review prompt.

```yaml
- id: security-ok
  type: agent_review
  prompt: Verify no obvious security issues remain.
  agent: verifier
```

### `test_result`

Runs a test command and parses output.

```yaml
- id: pester
  type: test_result
  command: Invoke-Pester -Path .\tests
  parser: pester
```

Parsers: `pester`, `vitest`, `jest`, `generic` (exit code only).

### `manual_approval`

Placeholder for human gate. Auto-approved when `ApprovalPolicy` is configured with `autoApproveManualChecks` (tests/CI).

```yaml
- id: ship-it
  type: manual_approval
  message: Confirm release to production.
```

## Adding a new check type

1. Add variant to `acceptanceCheckSchema` in `src/schemas/acceptance.schema.ts`
2. Implement handler in `AcceptanceRunner.runSingleCheck` with exhaustive `switch`
3. Add tests in `src/tests/orchestrator.test.ts`

## Policy interaction

`command` checks pass through `commandPolicy` when using `NodeShellRunner` with `enforcePolicy: true`. Blocked commands fail the check with a clear message.
