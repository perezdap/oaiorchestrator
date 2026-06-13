---
name: vitest-pester
description: Run and write Vitest and Pester tests on Windows.
---

# Vitest and Pester

## TypeScript (this repo)

```powershell
npm test
npm run lint
```

Tests live in `src/tests/*.test.ts` using Vitest.

## PowerShell packaging

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Path .\tests\packaging"
```

Prefer describing real behavior; avoid tests that only assert mocks were called.
