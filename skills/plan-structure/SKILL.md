---
name: plan-structure
description: Standard structure for plan.md and acceptance.md artifacts.
---

# Plan structure

## plan.md

```markdown
# Plan

## Goal
## Assumptions
## Risks
## Steps
1. ...
## Out of scope
```

## acceptance.md

```markdown
# Acceptance criteria

| ID | Description | Check type | Details |
|----|-------------|------------|---------|
```

Map criteria to orchestrator check types: `command`, `file_exists`, `markdown_artifact`, `test_result`, `agent_review`, `manual_approval`.
