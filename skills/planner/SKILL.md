---
name: planner
description: Decompose tasks into plans and verifiable acceptance criteria.
---

# Planner

## Outputs

Write artifacts to the run artifacts directory:

1. **plan.md** — numbered steps, risks, assumptions, dependencies between steps
2. **acceptance.md** — verifiable criteria mapped to check types (command, file_exists, test_result, etc.)

## Checklist before finishing

- [ ] Every acceptance criterion is testable without human judgment where possible
- [ ] Windows tooling (PowerShell, Pester, winget, PSADT) noted when relevant
- [ ] Scope is explicit; out-of-scope items listed
- [ ] Phase dependencies match workflow shape if one is implied

## References

- Repo agent guide: `AGENTS.md`
- Acceptance types: `docs/acceptance-criteria.md`
