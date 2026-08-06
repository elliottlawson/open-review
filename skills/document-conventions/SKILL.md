---
name: document-conventions
description: Documents a project's conventions — discovers where your standards live, confirms them with you, and writes a committed REVIEW.md table of contents so future reviews judge against your real standards. Optional; run once per project, re-run to amend.
license: MIT
metadata:
  version: "2"
---

# Review setup

Configure the review skill for this repository. Run once when you first install `review`, and re-run whenever your standards move.

## What this does

The review skill works out of the box by auto-discovering your standards. This makes it explicit: you tell it exactly where things live, so it doesn't hunt every time. The result is a `REVIEW.md` committed to the repo root — your file, not the skill's — so it survives skill updates. The review skill reads it first, and only falls back to auto-discovery when it's absent.

## Step 1 — Discover

Run `/infer-conventions` and record what it finds.

## Step 2 — Confirm with the user

Show your findings and check them — this is a conversation, not a form:

- "These are your conventions docs — correct?"
- "Any standards I missed? Any of these wrong?"

Adjust the list based on the answers before writing anything.

## Step 3 — Write REVIEW.md

Write `REVIEW.md` at the repo root (create it if missing; merge into it if it exists). It's a **table of contents in natural language** — write it the way you'd guide a human teammate to the right docs.

Structure it as a `## <pass>` section per pass (mission, architecture, implementation, craft, security, performance), with the docs for that pass beneath it. Notes on writing it well:

- **Point at documents, don't restate rules.** If a rule lives in a doc, say *"see `knowledge/technical/conventions.md`"* — don't copy the rule into `REVIEW.md`. This file is a map, not a duplicate of your standards.
- **Natural language beats dry key-value.** A short sentence like "Architecture generally lives in `knowledge/technical/`, with the important system docs below:" reads better than a bare list, and the reviewing agent reads it more accurately.
- **Give explicit "look at these for X" pointers.** Prefer naming the specific docs a pass should read, over a general pointer to the folder.
- **Omit passes with no project-specific standard.** Don't invent sections. If the project has no security doc, there's no security section. Never pad with a "see `conventions.md`" pointer unless that doc genuinely covers the topic — verify by reading it, not by assuming. A genuinely uncovered pass can get a one-line note under `## Notes` ("security isn't documented; guidance is incidental in X"), not a fake section.
- **Optional `## Notes` section.** For anything that doesn't fit a pass — repo quirks, review preferences, things to always check. Only add it if there's something worth saying.

Example shape (adapt to what the project actually has — do not include sections that don't apply):

```markdown
# <Project> Review Brief

Tells the review skill where this project keeps its standards. Each pass reads
the docs mapped below. Edit by hand, or re-run `/document-conventions` to regenerate.

## Stack

<framework(s) and key libraries>

## Mission

- <where the PR description / issue / PRD lives, and what defines "done">

## Architecture

Architecture generally lives in `<folder>`. The key docs are:

- `<path>` — <what it covers>
- `<path>` — <what it covers>

## Implementation

- `<conventions path>` — behavioral conventions, authoritative
- `<testing path>` — how this project tests

## Security

- see `<conventions path>` for security rules

## Notes

- <anything worth saying that doesn't fit above>
```

## Step 4 — Commit

Stage and commit `REVIEW.md`. Follow the project's commit conventions.

## See also

To make the agent run reviews automatically before PRs, run the `setup-review-loop` skill — it wires the loop into the project's agent instructions.

## Re-running

Re-running this skill loads the existing `REVIEW.md` and amends it. Safe to run any time.
