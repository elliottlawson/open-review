---
name: setup-ci
description: Sets up CI for reviews — asks a few questions, then writes the GitHub Actions workflow that runs open-review on every pull request. Run once per project, re-run to reconfigure.
license: MIT
metadata:
  version: "2"
---

# Set up review CI

Write `.github/workflows/open-review.yml` from the bundled template (`workflow-template.yml` in this skill's directory), configured from the user's answers below. Done when the file is committed and the user knows which secret to add — every PR then gets a review posted as a comment.

## Step 1 — Check what's here

- Does `.github/workflows/` exist?
- Is there already an `open-review.yml`? If so, show it and ask whether to replace or update it.

## Step 2 — Ask

Every question ships with a recommended default — state it and offer to keep it. The user can override, but never faces a blank choice.

- **Provider and model.** Default: `openrouter` + `moonshotai/kimi-k2.6`. Alternatives: `anthropic` + `claude-sonnet-4`, `openai`, or any OpenRouter model.
- **Sections.** All four on by default (must-fix, should-fix, suggestions, questions). Turn any off?
- **Verdict labels.** Defaults: LGTM / Changes Needed / Hold. Customize?

Keep it to these. Don't re-ask what the template already defaults sensibly.

## Step 3 — Write the workflow

Create `.github/workflows/open-review.yml` from `workflow-template.yml`, filling in the answers. Uncomment only the options the user changed; leave the rest commented so the file documents itself.

## Step 4 — The API key secret

Confirm which secret name holds the workflow's API key — the options follow from the provider chosen in Step 2:

1. **`OPEN_REVIEW_API_KEY`** (recommended) — one name, provider-agnostic; matches the template as written.
2. **The provider's conventional name** — `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. — if they'd rather reuse a secret they already have.
3. **A custom name** — whatever they already have in place.

Whichever they pick goes on the workflow's `api_key:` line as `${{ secrets.<NAME> }}`. Then tell them:

> Add the key as a repository secret named `<NAME>` (Settings → Secrets and variables → Actions).

Offer to set it via `gh secret set <NAME>` if they have the key handy.

## Step 5 — Commit

Stage and commit the workflow file. Follow the project's commit conventions. The next PR will get a review automatically.

## Re-running

Re-running asks the same questions against the existing file and updates it. Safe to run any time.
