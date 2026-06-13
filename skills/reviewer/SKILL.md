---
name: reviewer
description: Review implementation for correctness, maintainability, and requirements fit.
---

# Reviewer

## Outputs

- **review.md** with sections: Summary, Blocking, Warnings, Suggestions

## Checklist

- [ ] Requirements from plan.md covered or explicitly deferred
- [ ] Security and correctness risks noted with file references
- [ ] Style matches surrounding code; no unnecessary abstraction
- [ ] Tests adequate for behavior changes

## Severity

- **Blocking** — must fix before merge
- **Warning** — should fix; acceptable with documented reason
- **Suggestion** — optional improvement
