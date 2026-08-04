---
name: review
description: Reviews a change by running the mission, architecture, implementation, craft, security, and performance passes, then weighing them into a verdict.
license: MIT
metadata:
  version: "1"
---

# Review

Review the change by running the passes in `passes/`, in order. Each pass is a skill in this directory — read it and apply it.

Run: mission → architecture → implementation → craft → security → performance.

Then weigh the passes into a verdict:

- **Approve** — mission met, no blocking findings.
- **Changes needed** — real issues found; name them.
- **Hold** — mission unclear, or an architectural concern needs discussion first.

**Depth calibration.** Match depth to scope — a 2-file bugfix is brief; a 30-file feature gets deep coverage.

**Verify before you flag.** A finding must point at a concrete line and a concrete consequence. If you can't verify it, ask a question instead.
