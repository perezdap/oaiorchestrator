# Prompt: Convert CursorOrchestrator into oaiorchestrator (OpenAI-powered)

You are an expert TypeScript engineer specializing in agent orchestration frameworks and LLM SDK integrations. Your task is to convert the current codebase (a private fork of CursorOrchestrator) into **oaiorchestrator** — a Windows-first, OpenAI-compatible (or any /v1/chat/completions) version of the framework.

## Core Goal
Remove all dependency on the Cursor SDK (`@cursor/sdk`) while preserving the powerful workflow engine, phase orchestration, acceptance criteria system, skills/prompt injection, policies, durable `.runs/` artifacts, and Windows/PowerShell-first design.

The intelligence provider (the "brain") must become pluggable via a direct OpenAI-compatible chat completions endpoint (supporting standard OpenAI, Azure OpenAI, Grok/xAI, or custom gateways like the existing AI_REVIEW_ENDPOINT in the user's environment).

## Non-Negotiables (Preserve These Exactly)
- **Decoupled runners**: The core (`src/orchestrator/`, `TaskGraph`, `PhaseExecutor`, `AcceptanceGate`, `RunState`, etc.) must never import any LLM SDK. Only files under `src/runners/` should touch LLM clients.
- **AgentRunner interface**: Keep and extend `src/runners/types.ts`. The existing `MockAgentRunner` must continue to work for testing and dry-runs.
- **Acceptance criteria & host-side execution**: All verification (shell commands, Pester/Vitest parsers, file existence, manual approval) must remain in the host process (`src/orchestrator/acceptanceChecks/` and `shellRunner.ts`). The LLM proposes; the host proves.
- **Windows-first defaults**: PowerShell 7+ (`pwsh`) for shell execution, Windows paths, backtick line continuation in docs/examples.
- **Skills system**: `skills/` folder + `SkillResolver` + injection into prompts via `PromptComposer` / `composeAgentPrompt.ts`. Existing skills (researcher, reviewer, winget-psadt-package, etc.) and the user's `app-packager` skill must continue to work.
- **Workflow model**: YAML/JSON workflows with `agents`, `phases` (with `dependsOn`, `objective`, `skills`, `outputs`, `acceptance`), inputs, etc.
- **Durable runs**: Everything under `.runs/<run-id>/` (request.md, state.json, phase-log.md, agent-messages/, artifacts/, acceptance-report, final-report) must stay identical.
- **Policies**: `commandPolicy`, `filePolicy`, `approvalPolicy` must remain.
- **Existing examples**: Keep and make functional the examples in `src/examples/` and any workflows the user adds (especially research + packaging related).
- **AGENTS.md / docs**: Update documentation to reflect "OpenAI-compatible" instead of Cursor. Keep the Windows-first, security, and extension guidance.

## What Must Change
1. **Runner layer (primary change)**:
   - Delete or deprecate `cursorLocalRunner.ts`, `cursorCloudRunner.ts`, and `cursorRunnerCore.ts`.
   - Implement a new `OpenAiLocalRunner.ts` (and optionally a cloud variant later) that uses direct `fetch` (or the official `openai` npm package) against a chat completions endpoint.
   - Support:
     - Standard OpenAI (`https://api.openai.com/v1`)
     - Custom base URLs / endpoints (for user's existing `AI_REVIEW_ENDPOINT`, xAI/Grok, local proxies, etc.)
     - `OPENAI_API_KEY` (and fallback to `AI_REVIEW_TOKEN` or similar for compatibility with their current setup)
     - Model selection per agent config
   - Use structured outputs (JSON mode / response_format) or tool calling where helpful, but **never** trust the LLM to perform security-critical actions (downloads, hash verification, signature checks, running tests). Those must stay as acceptance criteria that execute real `pwsh` commands in the host.
   - Produce the exact `AgentRunResult` shape expected by the rest of the system.
   - Handle secret redaction (reuse `redactSecrets` from policies).

2. **Prompt composition**:
   - Keep `PromptComposer.ts` and `composeAgentPrompt.ts` as the central place for building the system + user messages + skill injection.
   - Remove any Cursor-specific formatting or tool schemas.
   - Ensure the prompt explicitly tells the model about the available acceptance gates and that it should propose actions for the host to verify.

3. **Package / build / CLI**:
   - Rename the package from "cursor-orchestrator" to "oaiorchestrator" (or similar) in `package.json`.
   - Update the binary name if desired (keep "orchestrator" for now or change to "oaiorchestrator").
   - Remove `@cursor/sdk` dependency.
   - Add `openai` (optional, for convenience) or keep pure fetch + zod for minimal dependencies. Prefer minimal deps for fast private use.
   - Update scripts, `engines`, `keywords`, `description`.
   - Update `src/index.ts` exports to expose the new runner(s) and keep `MockAgentRunner`.
   - Update `src/cli.ts` and any dev commands.

4. **Types and configuration**:
   - In agent config (`src/schemas/agent.schema.ts` and related), keep `model` and `instructions`. Add optional `baseUrl` / endpoint override support via env or config.
   - Update `AGENTS.md` (the file you're reading this from) and docs/ to describe the new OpenAI path. Mention that `CURSOR_API_KEY` is replaced by `OPENAI_API_KEY` (with fallbacks).

5. **Testing and examples**:
   - Keep tests that use `MockAgentRunner` (exclude any Cursor SDK tests).
   - Update `src/examples/` so they demonstrate the new runner (e.g. programmatic usage with `OpenAiLocalRunner` + `Mock` fallback).
   - Ensure `npm test`, `npm run build`, `npm run lint`, and `npm run validate` still work.
   - Add or adapt a `research-installer.workflow.yaml` (or similar) that exercises real host-side verification (calling user's `Verify-Installer.ps1`, hash checks, etc.) — this is a key use case for the user's packaging work.

6. **Windows / PowerShell specifics**:
   - The `NodeShellRunner` / `shellRunner.ts` must continue to default to `pwsh`.
   - Update any example commands in docs and workflows to use PowerShell syntax.

## Step-by-Step Execution Order (follow this sequence)
1. Update `package.json`: name, description, remove Cursor dep, add OpenAI-related deps if using the SDK, update bin/scripts.
2. Implement / integrate `OpenAiLocalRunner` (base it on the existing starter in `private-forks/OpenOrchestrator/src/runners/OpenAiLocalRunner.ts` if present, or create fresh in `src/runners/OpenAiLocalRunner.ts`).
3. Update `src/runners/index.ts` (or equivalent) to register the new runner as default when no `agentRunner` override is provided.
4. Remove Cursor-specific runner files (or keep them behind a flag for migration).
5. Update `PromptComposer` / prompt assembly to be LLM-agnostic (strip Cursor tool schemas).
6. Update CLI, types, schemas, and `src/index.ts` exports.
7. Update documentation (`AGENTS.md`, `docs/*.md`, `README.md`).
8. Update examples and add/adapt a packaging-research workflow.
9. Run build + lint + tests. Fix issues.
10. Add a basic `.env.example` for `OPENAI_API_KEY` and custom base URL.
11. Ensure `MockAgentRunner` is still the easy way to run without any API key.

## Success Criteria
- `orchestrator run --workflow .\src\examples\generic-task.workflow.yaml` works with an OpenAI key (or dry-run/Mock).
- A researcher + verifier workflow can call real PowerShell verification scripts as acceptance criteria and only succeed when the host confirms hashes/signatures/etc.
- The system can be driven from the user's `winget-intune-psadt-packager` project for installer research that feeds `knowledge/overrides/` and eventually calls `DeliveryManYamlBuilder`.
- No `@cursor/sdk` remains in the dependency tree or runtime code (except possibly in comments or migration notes).
- All existing workflow features (dependsOn, skills injection, acceptance retries, resume, policies, artifacts) continue to function identically.

## Style & Constraints
- Match the existing code style (strict TS, ESM, no inline imports, exhaustive switches, etc.).
- Keep the project both a library and a CLI/reference implementation.
- Prioritize safety: the LLM must not be able to bypass host acceptance gates for security-sensitive operations.
- Use the user's existing conventions (PowerShell examples, backticks for line continuation, etc.).
- Since this is a private fork, you may make breaking changes from the original CursorOrchestrator (update version, docs accordingly).

## Working Directory & Scope
You are working inside the `oaiorchestrator/` folder (the private clone). Only modify files inside it. Do not touch the original `CursorOrchestrator/` or other projects unless the prompt explicitly says to update cross-references.

Start by reading the current `AGENTS.md`, `src/runners/types.ts`, `src/runners/PromptComposer.ts`, `src/runners/mockRunner.ts`, and `package.json` to understand the current state.

When you make changes, run `npm run build && npm run lint && npm test` frequently and fix issues before moving on.

Output a clear summary at the end of what was changed, what still needs manual work, and how to run a test workflow with a real OpenAI key.

Begin the conversion now.