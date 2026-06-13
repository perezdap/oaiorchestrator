---
name: acceptance-verification
description: How to verify acceptance criteria with evidence.
---

# Acceptance verification

1. Load acceptance.md and workflow acceptance config if present
2. For each criterion, run the check or inspect the artifact
3. Record in verification.md:

```markdown
# Verification

## criterion-id
- Result: pass | fail
- Evidence: command output summary or file path
```

Use the artifacts directory for outputs; redact secrets from evidence.
