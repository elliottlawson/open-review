# Open Review

AI-powered PR code review tool. Automatically reviews pull requests using Claude or GPT, posts comments to GitHub, and enforces your coding conventions.

## Features

- **Automated code review** on every PR
- **Multiple LLM providers**: Anthropic Claude, OpenAI GPT-4
- **Convention enforcement**: Reads your CONVENTIONS.md and enforces project rules
- **Smart comment lifecycle**: Updates comments in place, auto-resolves when issues are fixed
- **Linear integration**: Links related Linear issues in reviews (optional)

## Quick Start

### 1. Install

```bash
npm install -g open-review
```

### 2. Initialize in your repo

```bash
cd your-project
open-review init
```

This creates:
- `.open-review.yml` - Configuration file
- `.github/workflows/open-review.yml` - GitHub Action workflow

### 3. Add API key to GitHub Secrets

Go to your repo's **Settings → Secrets and variables → Actions** and add:
- `ANTHROPIC_API_KEY` (for Claude) or `OPENAI_API_KEY` (for GPT-4)

### 4. Open a PR!

The review will run automatically on every pull request.

## Configuration

`.open-review.yml`:

```yaml
# LLM Settings
llm:
  provider: anthropic  # or openai
  model: claude-sonnet-4-20250514

# Review Behavior
review:
  # Path to conventions file, or 'auto' to detect
  conventions: auto
  
  # Minimum severity to report: info, warning, or critical
  severity_threshold: info
  
  # Auto-resolve comments when issues are fixed
  auto_resolve: true
  
  # Custom instructions for the reviewer
  custom_instructions: |
    - Pay special attention to SQL injection
    - All API endpoints must have rate limiting

# Files to ignore (glob patterns)
ignore:
  - "*.lock"
  - "dist/**"
```

## Manual Usage

```bash
# Review a specific PR
open-review pr owner/repo#123

# Dry run (don't post comments)
open-review pr owner/repo#123 --dry-run --verbose

# Override model
open-review pr owner/repo#123 --model claude-opus-4-20250514
```

## Environment Variables

- `GITHUB_TOKEN` - GitHub API token (required)
- `ANTHROPIC_API_KEY` - For Claude models
- `OPENAI_API_KEY` - For GPT models
- `LINEAR_API_KEY` - For Linear integration (optional)

## Convention Files

The reviewer looks for convention files in this order:
1. `CONVENTIONS.md`
2. `CLAUDE.md`
3. `.github/CONVENTIONS.md`
4. `docs/conventions.md`
5. `docs/CONVENTIONS.md`
6. `.open-review/rules.md`
7. `rules.md`

When found, the reviewer enforces these rules and cites specific violations.

## License

MIT
