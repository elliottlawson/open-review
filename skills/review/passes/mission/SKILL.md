---
name: mission
description: Finds the target outcome of the work, then judges whether the work in scope achieves it.
license: MIT
metadata:
  version: "1"
---

# Mission

Two things:

1. **Find the target.** What was this work supposed to achieve? Look at the PR
   description, the linked issue or ticket, the commits. State it in one line.

2. **Judge alignment.** Does the work in scope actually achieve that target,
   or does it do something else?

## Output

- **Met** — the work achieves the target.
- **Missing** — the work falls short; name what's missing.
- **Different** — the work does something other than the target.
- **Unclear** — the target isn't stated anywhere. Say so, and note what you assumed.

If the mission is unclear or the work misses it, that is the most important
finding in the review. State it plainly before anything else.
