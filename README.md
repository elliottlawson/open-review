# Open Review

Composable, skill-based code review. Your agent runs the skills; the skills are the product.

## Install

```bash
npx skills add elliottlawson/open-review --skill review
```

Then, in your agent:

> Use the review skill to review the changes on this branch.

The review runs six passes — **mission → architecture → implementation → craft →
security → performance** — and weighs them into a verdict: approve, changes
needed, or hold. Out of the box it works from your repo's own docs; no
configuration required.

## The skills

One skill installs. Everything else resolves at runtime
(`npx skills use elliottlawson/open-review@<name>`, or fetch from GitHub).

| Skill | What it does |
|---|---|
| `review` | The review itself — six passes, a weighed verdict, prose output |
| `document-conventions` | Writes a `REVIEW.md`: a natural-language table of contents mapping each pass to the docs that define "correct" for your project. Optional, one-time, makes reviews sharper |
| `setup-ci` | Writes the GitHub Actions workflow that reviews every PR |
| `review-as-json` | The review emitted as structured JSON — used by CI |

## Conventions packs

`skills/conventions/<stack>/` — framework standards for writing *and* reviewing
code (laravel, react, inertia; rough drafts). The review detects your stack and
applies the matching packs automatically.

**Precedence:** your project's conventions (`REVIEW.md` / `AGENTS.md`) →
framework packs → general merits.

## CI

[open-review-action](https://github.com/elliottlawson/open-review-action) runs
the review on every pull request and posts the result as a comment:

```yaml
- uses: elliottlawson/open-review-action@v2
  with:
    api_key: ${{ secrets.OPEN_REVIEW_API_KEY }}
```

The `setup-ci` skill generates this for you, configured from a few questions.

## Legacy

Versions ≤ 0.1.x (the npm package, and the action's `@v1` tag) were the old
Mastra CLI engine: frozen and unmaintained. Source material lives on in
[open-review-lab](https://github.com/elliottlawson/open-review-lab) (private);
everything else is git history.
