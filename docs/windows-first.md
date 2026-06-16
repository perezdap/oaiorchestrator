# Windows-First Design

oaiorchestrator targets Windows as the primary development and deployment environment.

## Shell execution

`NodeShellRunner` defaults to **PowerShell 7+** (`pwsh`) on Windows:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "<command>"
```

Acceptance criteria and examples use PowerShell idioms:

- `Invoke-Pester` for tests
- `Write-Output` / `exit 0` for simple checks
- Windows paths in workflow examples (`.\tests\packaging`)

## Paths

- Workspace roots use `C:\...` conventions
- `filePolicy` resolves paths with `path.resolve` and blocks traversal outside workspace
- Run artifacts live under `.runs\<run-id>\`

## Packaging workflows

`winget-psadt-package.workflow.yaml` demonstrates:

- winget manifest generation
- PSADT wrapper scripts
- Pester validation
- Intune win32 app release checklist via `release-manager` agent

`research-installer.workflow.yaml` demonstrates host-side verification of model claims: the researcher proposes a download URL and SHA256, then acceptance criteria download the file, recompute the hash with `Get-FileHash`, check the Authenticode signature, and optionally run `$env:ORCH_VERIFY_SCRIPT`.

## Agent guidance

Built-in agent instructions mention PowerShell, Pester, winget, and PSADT where relevant so agents prefer Windows-native tooling on Windows hosts.

## CLI usage

All documented commands use PowerShell line continuation (backtick) and Windows path separators.

## CI on Windows

```powershell
npm install
npm run build
npm test
oaiorchestrator validate --workflow .\src\examples\generic-task.workflow.yaml
```

Set `OPENAI_API_KEY` in the pipeline secret store for live model runs; use `MockAgentRunner` for deterministic CI without API calls.

## Extending for other platforms

`NodeShellRunner` accepts `shell: 'default'` which uses `sh -c` on non-Windows. The framework remains cross-platform; Windows optimizations are defaults, not hard requirements.
