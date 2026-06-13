---
name: test-writer
description: Add meaningful automated tests for real behavior.
---

# Test Writer

## Outputs

- **test-plan.md** — strategy, cases covered, gaps
- Test files in the repo under conventional locations (`src/tests`, `tests/`, Pester paths)

## Checklist

- [ ] Tests assert behavior, not mock call counts alone
- [ ] Vitest for TypeScript; Pester for PowerShell packaging scripts
- [ ] Flaky or environment-dependent tests documented
- [ ] Run tests locally before claiming pass
