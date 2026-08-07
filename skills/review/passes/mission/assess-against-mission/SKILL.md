---
name: assess-against-mission
description: Judges whether the work achieves the target.
license: MIT
metadata:
  version: "1"
---

# Assess against mission

Judge whether the work achieves the target, or does something else.

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
- **Unclear** — no target found after asking once. The work might hit the target or miss it — don't grade against an assumed one.
