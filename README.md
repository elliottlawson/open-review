# Open Review

Composable, skill-based code review. Your agent runs the skills; the skills are the product.

## What it does

The `review` skill runs six passes — **mission → architecture → implementation →
craft → security → performance** — and weighs them into a verdict: approve,
changes needed, or hold. Out of the box it works from your repo's own docs; no
configuration required. Framework packs (Laravel, React, Inertia — rough drafts)
apply automatically when your stack is detected, and your project's own
conventions always win: `REVIEW.md` / `AGENTS.md` → packs → general merits.

## Setup

One skill installs; everything else runs on demand. Each step below gives you the
command to run yourself, or a self-contained prompt to paste into your agent.

**1. Install the review skill**

```bash
npx skills add elliottlawson/open-review --skill review
```

**2. Review a change** — paste into your agent:

```
Use the review skill to review the changes on this branch.
```

**3. Set up the review loop** — every change gets reviewed before it becomes a PR:

```bash
npx skills use elliottlawson/open-review@setup-review-loop
```

Or paste this into your agent:

```
Run `npx skills use elliottlawson/open-review@setup-review-loop` and follow it to set up the review loop for this project. Open a PR with the change.
```

**4. Document your conventions** (optional) — writes a `REVIEW.md` mapping each
pass to the docs that define "correct" for your project:

```bash
npx skills use elliottlawson/open-review@document-conventions
```

Or paste this into your agent:

```
Run `npx skills use elliottlawson/open-review@document-conventions` and follow it to write this project's REVIEW.md. Open a PR with the result.
```

**5. Set up CI** — reviews every pull request and posts the result as a comment:

```bash
npx skills use elliottlawson/open-review@setup-ci
```

Or paste this into your agent:

```
Run `npx skills use elliottlawson/open-review@setup-ci` and follow it to set up PR reviews for this repo. Open a PR with the workflow.
```

Runtime skills print a ready-to-use prompt — either paste that output into your
agent yourself, or use the self-contained prompts above and let the agent do it.

## The skills

| Skill | What it does |
|---|---|
| `review` | The review itself — six passes, a weighed verdict, prose output |
| `setup-review-loop` | Wires review into the project's agent instructions, so every change gets reviewed before it becomes a PR |
| `document-conventions` | Writes a `REVIEW.md`: a natural-language table of contents mapping each pass to your project's docs |
| `setup-ci` | Writes the GitHub Actions workflow that reviews every PR |
| `review-as-json` | The review emitted as structured JSON — used by CI |

## CI

[open-review-action](https://github.com/elliottlawson/open-review-action) runs
the review on every pull request and posts the result as a comment. The
`setup-ci` skill generates the workflow for you; it looks like:

```yaml
- uses: elliottlawson/open-review-action@v2
  with:
    api_key: ${{ secrets.OPEN_REVIEW_API_KEY }}
```
