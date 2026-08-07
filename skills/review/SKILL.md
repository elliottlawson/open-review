---
name: review
description: Reviews a change by running the mission, architecture, implementation, craft, security, and performance passes, then weighing them into a verdict.
license: MIT
metadata:
  version: "3"
---

# Review

## Scope

The change is the diff against the merge-base with the base branch (`git diff origin/main...HEAD`, or the base/range the caller gives). Confirm the ref resolves; if the diff is empty, say so and stop. Skip generated and vendored files.

## Step 0 — Find the project's reference material

Map the project's standards and stack with `/infer-conventions`; use those paths throughout the passes. If the project has no documented standards, say so in the verdict instead of inventing any.

## Passes

Run in order: mission → architecture → implementation → craft → security → performance. Then weigh them into a verdict:

- **Approve** — mission met, no blocking findings.
- **Changes needed** — real issues found; name them.
- **Hold** — mission unclear, or an architectural concern needs discussion first.

**Depth calibration.** Match depth to scope — a 2-file bugfix is brief; a 30-file feature gets deep coverage.

**Verify before you flag.** A finding must point at a concrete line and a concrete consequence. If you can't verify it, ask a question instead.

## Reporting

Report your findings in prose — severity (critical / warning / info), the pass that found it, the file and line, and why it matters.

- **Judge the change, not the codebase.** Blocking findings only on new or meaningfully changed code; a pre-existing violation is advisory at most.
- **Cite the standard, state the target pattern.** When the project has documented standards, name the doc a finding violates and the pattern to follow instead.
- **Report repeated issues once.** The same issue across multiple files is one finding — note that it applies broadly.

Under CI, `/review-as-json` wraps this review and shapes the output as JSON.
