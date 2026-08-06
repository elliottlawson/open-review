---
name: setup-ci
description: Sets up CI for reviews — asks a few questions, then writes the GitHub Actions workflow that runs open-review on every pull request. Run once per project, re-run to reconfigure.
license: MIT
metadata:
  version: "1"
---

# Review CI setup

Set up the GitHub Actions workflow that runs open-review on every pull request in this repository.

## What this does

Writes `.github/workflows/open-review.yml` from the bundled template (`workflow-template.yml` in this skill's directory), configured from your answers. The workflow runs the `review-as-json` skill via opencode on every PR and posts the review as a comment.

## Step 1 — Check what's here

- Does `.github/workflows/` exist?
- Is there already an `open-review.yml`? If so, show it and ask whether to replace or update it.

## Step 2 — Ask

Ask only what's needed:

- **Provider and model.** Default: `openrouter` + `moonshotai/kimi-k2.6`. Alternatives: `anthropic` + `claude-sonnet-4`, `openai`, or any OpenRouter model.
- **Sections.** All four on by default (must-fix, should-fix, suggestions, questions). Turn any off?
- **Verdict labels.** Defaults: LGTM / CHANGES REQUESTED / HOLD. Customize?

Keep it to these. Don't re-ask what the template already defaults sensibly.

## Step 3 — Write the workflow

Create `.github/workflows/open-review.yml` from `workflow-template.yml`, filling in the answers. Uncomment only the options the user changed; leave the rest commented so the file documents itself.

## Step 4 — Tell them about the secret

The workflow needs an API key. Tell the user:

> Add your provider API key as a repository secret named `OPEN_REVIEW_API_KEY` (Settings → Secrets and variables → Actions). For OpenRouter, that's your OpenRouter key.

Offer to set it via `gh secret set OPEN_REVIEW_API_KEY` if they have the key handy.

## Step 5 — Commit

Stage and commit the workflow file. Follow the project's commit conventions. The next PR will get a review automatically.

## Re-running

Re-running asks the same questions against the existing file and updates it. Safe to run any time.
