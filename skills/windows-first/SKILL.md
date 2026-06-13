---
name: windows-first
description: Windows-native paths, PowerShell, and deployment tooling defaults.
---

# Windows-first defaults

- Prefer **PowerShell 7+** (`pwsh`) over Bash for scripts and acceptance commands
- Use Windows paths (`C:\Users\...`) in docs and examples unless cross-platform is required
- Packaging: winget manifests, PSADT, Pester, Intune win32 app patterns
- Do not assume Unix-only tools (`rm -rf`, `chmod`, `systemctl`) without explicit cross-platform scope
