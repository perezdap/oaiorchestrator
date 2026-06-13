---
name: winget-psadt-package
description: Winget manifest and PSADT/Intune packaging workflow for Windows apps.
---

# Winget + PSADT packaging

## Deliverables

- Winget manifest (`winget-manifest.yaml` or standard manifest layout)
- PSADT deployment scripts with install/uninstall/detection
- Pester tests under `tests/packaging` or equivalent

## Conventions

- Silent install switches documented per vendor
- Detection logic matches Intune win32 app requirements
- Use PSADT v4 patterns where applicable; PowerShell 7+ for test runners
- Document Intune publishing checklist in release artifacts

## Verification

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Path .\tests\packaging"
```
