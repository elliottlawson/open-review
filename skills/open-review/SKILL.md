---
name: open-review
description: Review code changes using the Open Review methodology. Use for PR reviews, peer reviews, pre-merge reviews, and working tree reviews.
---

# Open Review

Perform a code review with the current agent runtime and available workspace tools.

## Procedure

1. Read `.open-review/config.yml`.
2. Load the configured methodology, presets, and project conventions.
3. Determine the review target from the user's request, command arguments, or the current diff against `main`.
4. Inspect the diff and related files for behavior, security, data integrity, performance, testing, and maintainability risks.
5. Report findings first, ordered by severity, with file and line references when available.
6. Include open questions when a decision needs human clarification.
7. Include residual risks or testing gaps after the findings.

## Output

Use this structure:

```md
## Findings

- [severity] `path/to/file.ext:line` Concise title. Explain the issue, impact, and recommended fix.

## Questions

- Question that affects implementation or review confidence.

## Residual Risks

- Testing, context, or verification gaps that remain.
```

If there are no findings, state that explicitly and include any residual risks or testing gaps.
