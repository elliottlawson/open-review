---
name: setup-review-loop
description: Sets up the review loop — wires review into the project's agent instructions, so the agent runs `/review` on the full diff before opening a PR and iterates until it's clean. One-time setup; safe to re-run.
license: MIT
metadata:
  version: "2"
---

# Set up the review loop

Add the review loop to the project's agent instructions: before opening a PR, the agent runs `/review` on the full diff and iterates until it's clean. Done when the instruction sits in the project's instruction file, any mirrored files are in sync, and the user has seen the diff.

## Step 1 — Make sure review is installed

The loop calls `/review`. Check for it (`.agents/skills/review/`, or the project/agent skills directory). If it's missing, install it (non-interactively, so nothing blocks on a prompt):

```bash
npx skills add elliottlawson/open-review --skill review -y
```

If an agent session is already running, note that skills register at session start — a fresh session is needed to see it.

## Step 2 — Find the instruction files

Look for the project's agent instructions: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/`, opencode config, or similar.

Watch for mirrored files — some repos keep several files byte-identical copies of one source. If so, they must stay identical: write once, copy to the mirrors.

If no instruction file exists, ask before creating one — a minimal `AGENTS.md` with a short workflow section is usually right.

## Step 3 — Wire the loop

Add the loop instruction where the file describes workflow or process. The plainest form:

> Before opening a PR, run `/review` on the full diff. Fix what it flags or consciously accept it; iterate until the review is clean.

**Fit it in, don't bolt it on.** If the file has a commit/PR workflow, extend that bullet list. If it has a skills table, add a row. Match the file's own structure and tone. Never rewrite, reorder, or "improve" what was already there. Keep mirrored files in sync.

## Step 4 — Show the diff

Show the user exactly what you added, and where. One loop, clearly placed. If you found yourself writing paragraphs, stop and cut.

## Re-running

Safe to re-run: if the loop is already wired, say so and change nothing.
