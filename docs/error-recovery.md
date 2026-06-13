# Error recovery

The run engine classifies failures by **scope** and **kind**, persists partial progress, and supports resuming after crashes or explicit failures.

## Failure model

| Field | Values | Meaning |
|-------|--------|---------|
| `scope` | `phase`, `workflow` | Where the failure occurred |
| `kind` | `agent_execution`, `agent_exception`, `phase_acceptance`, `workflow_acceptance` | What failed |

### Phase-scoped failures

- **`agent_execution`** — the agent runner returned `success: false` after retries were exhausted.
- **`agent_exception`** — an unexpected exception escaped the agent runner call.
- **`phase_acceptance`** — phase-level acceptance criteria failed after retries.

Phase failures stop the workflow unless the phase declares `onFailure: skip` or `onFailure: continue`.

### Workflow-scoped failures

- **`workflow_acceptance`** — workflow-level acceptance criteria failed after retries.

All phases must complete before workflow acceptance runs.

## Partial progress on abort

When a run fails, the engine:

1. Appends a per-phase summary to `phase-log.md` (status, attempts, artifacts, errors).
2. Writes a **Partial progress** section in `final-report.md` when some phases finished.
3. Includes a structured **Failure** line with `[scope/kind]` classification.

`RunWorkflowResult.failure` carries the same structured object for programmatic callers.

## Resume after crash

`orchestrator resume` reloads `state.json` and calls `prepareRunForResume`:

1. Phases stuck in `running` or `retrying` are reset to `pending` so they re-execute.
2. A stale `currentPhaseId` pointing at a reset phase is cleared.
3. Run status `failed` or `running` is set back to `running`.
4. Completed and skipped phases are left untouched and skipped on the next walk.

Interrupted phases keep their prior `attempts` count for audit; execution restarts from attempt 1.

## API surface

- `RunErrors.ts` — `RunFailure`, `createPhaseFailure`, `createWorkflowFailure`, `formatRunFailure`
- `RunRecovery.ts` — `prepareRunForResume`, `logPartialResults`
- `RunWorkflowResult.failure` — optional structured failure on failed runs
