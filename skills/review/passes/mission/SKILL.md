---
name: mission
description: Finds the target outcome of the work, then judges whether the work in scope achieves it.
license: MIT
metadata:
  version: "1"
---

# Mission

Two things:

1. **Find the target.** What was this work supposed to achieve? Resolve it in
   order: an objective the caller passed in → a brief from this session → the
   PR body (prefer a `## Goal` section) → the linked issue or ticket. State it
   in one line. If none of these yields a target, ask once; if there's still
   nothing, say so and stop judging alignment.

2. **Judge alignment.** Does the work in scope actually achieve that target,
   or does it do something else?

## Findings

| Kind | Meaning |
|------|---------|
| **missing** | The target required it; the change omits it or only partially delivers |
| **wrong** | Aimed at a requirement but implements it incorrectly |
| **creep** | Behavior the target did not ask for |

Quote or paraphrase the target for each finding. Missing and wrong are
blocking; creep is advisory unless the extra behavior is material.

## Output

- **Met** — the work achieves the target.
- **Missing** — the work falls short; name what's missing.
- **Different** — the work does something other than the target.
- **Unclear** — no target found after asking once.

If the mission is unclear or the work misses it, that is the most important
finding in the review. State it plainly before anything else.
