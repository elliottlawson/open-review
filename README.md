# Open Review

Composable, skill-based code review. Your agent runs the skills; the skills are the product.

## Quick start

**1. Install the review skill**

```bash
npx skills add elliottlawson/open-review --skill review
```

**2. Review a change** — paste into your agent:

```
Use the review skill to review the changes on this branch.
```

The review runs six passes — **mission → architecture → implementation → craft →
security → performance** — and weighs them into a verdict: approve, changes
needed, or hold. Out of the box it works from your repo's own docs; no
configuration required.

**3. Make it a loop** (optional) — the agent reviews every change before it
becomes a PR:

```bash
npx skills use elliottlawson/open-review@setup-review-loop
```

**4. Sharpen reviews with your own conventions** (optional) — writes a
`REVIEW.md` mapping each pass to the docs that define "correct" for your project:

```bash
npx skills use elliottlawson/open-review@document-conventions
```

**5. Set up CI** (optional) — reviews every pull request and posts the result as
a comment:

```bash
npx skills use elliottlawson/open-review@setup-ci
```

Runtime skills print a ready-to-use prompt — run the command, paste what it
prints into your agent, done. Nothing to install for one-time skills.

## The skills

One skill installs. Everything else resolves at runtime.

| Skill | What it does |
|---|---|
| `review` | The review itself — six passes, a weighed verdict, prose output |
| `setup-review-loop` | Wires review into the project's agent instructions, so every change gets reviewed before it becomes a PR |
| `document-conventions` | Writes a `REVIEW.md`: a natural-language table of contents mapping each pass to your project's docs |
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
