---
name: setup-review-loop
description: Sets up the review loop — wires review into the project's agent instructions, so the agent runs `/review` on the full diff before opening a PR and iterates until it's clean. One-time setup; re-run to realign.
license: MIT
metadata:
  version: "3"
---

# Set up the review loop

Add the review loop to the project's agent instructions: before opening a PR, the agent runs `/review` on the full diff and iterates until it's clean. Done when the loop is present and current — or the user has chosen to keep their own wording — with any mirrored files in sync.

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

## Step 3 — Wire or realign the loop

The canonical instruction:

> Before opening a PR, run `/review` on the full diff. Fix what it flags or consciously accept it; iterate until the review is clean.

Keep it evergreen — no counts, versions, or paths that move.

Recognize the loop by content: an instruction to run `/review` on the diff before opening a PR, whatever its wording. Then:

- **Absent** — wire it in where the file describes workflow or process. **Fit it in, don't bolt it on.** If the file has a commit/PR workflow, extend that bullet list. If it has a skills table, add a row. Match the file's own structure and tone. Never rewrite, reorder, or "improve" what was already there. Keep mirrored files in sync.
- **Present and current** — say so and change nothing.
- **Present but stale or customized** — show their wording next to the canonical one and ask: realign, keep, or merge? Never silently rewrite a project's instruction file. If they keep theirs, note that it diverges from canonical and won't pick up future improvements.

## Step 4 — Show the diff

Show the user exactly what you added or changed, and where. One loop, clearly placed. If you found yourself writing paragraphs, stop and cut.
