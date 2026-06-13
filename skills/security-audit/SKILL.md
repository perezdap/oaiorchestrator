---
name: security-audit
description: Security audit focus for orchestrator and target repos.
---

# Security audit

- **commandPolicy** — risky git/filesystem commands blocked by default
- **filePolicy** — workspace root boundary
- **approvalPolicy** — deletions, pushes, secrets, manual checks
- Scan for hardcoded tokens, `.env` commits, and log redaction gaps
- Flag shell injection in acceptance `command` fields when user input is interpolated
