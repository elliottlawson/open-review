# Setup Guide

How to get effective AI code reviews with Open Review.

## Getting Started

### 1. Install

```bash
npm install -g open-review
```

### 2. Initialize

```bash
cd your-project
open-review init
```

The wizard will:
- Detect your frameworks (Laravel, React, Next.js, Vue)
- Copy relevant presets to `.open-review/presets/`
- Generate `.open-review/config.yml`
- Create agent skill files (`.cursorrules`, `CLAUDE.md`, `AGENTS.md`)
- Set up GitHub Action workflow

### 3. Set API Key

```bash
export OPEN_REVIEW_API_KEY=your_key_here
```

### 4. Run Your First Review

```bash
open-review review --diff main
```

## What Makes Effective Reviews

### Document Your Conventions

The most impactful thing you can do is document your project's conventions. The agent will search for these automatically.

Create a `CONVENTIONS.md` or similar file:

```markdown
# Project Conventions

## Architecture
- Controllers are CRUD-only. Business logic goes in Service classes.
- Use Form Requests for validation, never inline.

## Database
- All queries must use Eloquent scopes.
- No raw SQL without explicit approval.

## Testing
- Feature tests for all API endpoints.
- Unit tests for all service methods.
```

### Use Presets

Presets give the agent framework-specific awareness. They're auto-detected during `init`, or you can specify them:

```yaml
review:
  presets: [laravel, react]
```

### Customize Methodology

For advanced use, publish and edit the methodology:

```bash
open-review publish
# Edit .open-review/methodology/core.md
```

## Configuration

### Minimal Config

```yaml
version: "1.0"
review:
  methodology: default
  presets: auto
  conventions: auto
```

### Full Config

```yaml
version: "1.0"

review:
  methodology: default
  presets: [laravel, react]
  conventions: ./docs/standards.md

llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  api_key: ${OPEN_REVIEW_API_KEY}

output:
  format: human
  colors: auto
  timezone: America/New_York
```

## Using with Agents

### Cursor

The init wizard creates `.cursorrules`. The agent reads this file when reviewing code.

### Claude Code

The init wizard creates `CLAUDE.md`. The agent reads this file when reviewing code.

### Open Code

The init wizard creates `AGENTS.md`. The agent reads this file when reviewing code.

## Using with CI/CD

### GitHub Actions

The init wizard creates `.github/workflows/open-review.yml`. Add your API key to GitHub Secrets:

1. Go to Settings → Secrets → Actions
2. Add `OPEN_REVIEW_API_KEY`

The action runs automatically on PRs.

## Troubleshooting

### "API key required"

Set the environment variable:

```bash
export OPEN_REVIEW_API_KEY=your_key_here
```

### "No changes to review"

Make sure you have uncommitted changes or specify the correct ref:

```bash
open-review review --diff main
open-review review --diff HEAD~1
open-review review --diff staged
```

### Reviews aren't finding issues

1. Document your conventions
2. Use framework presets
3. Try a better model (Claude Opus, GPT-4o)
4. Use `--prompt` to focus the review
