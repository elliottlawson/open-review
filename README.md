# Open Review

AI-powered code review tool for local development and CI/CD. Reviews code using Claude or GPT, with flexible output for terminal, JSON, or platform-specific formats.

## Features

- **Local code review** - Review changes before pushing
- **CI/CD integration** - GitHub Action for PR reviews
- **Multiple LLM providers**: Anthropic Claude, OpenAI GPT-4, OpenRouter
- **Convention enforcement**: Reads your CONVENTIONS.md and enforces project rules
- **Flexible output**: Terminal, JSON, or GitHub-formatted markdown
- **Linear integration**: Links related Linear issues (optional)

## Philosophy

Open Review is **platform-agnostic**. The core engine reads code from your local filesystem and generates reviews. Platform-specific features (fetching PR metadata, posting comments) are handled by separate drivers like the [GitHub Action](https://github.com/elliottlawson/open-review-action).

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

### 3. Set up your API key

```bash
export ANTHROPIC_API_KEY=your_key_here
# or
export OPENAI_API_KEY=your_key_here
```

### 4. Optional: Set up GitHub Actions

For automatic PR reviews:

```bash
open-review setup-github
```

This creates `.github/workflows/open-review.yml` and requires setting up API keys in GitHub Secrets.

### 5. Review your code!

```bash
# Review staged changes
open-review review --diff staged

# Review changes against main
open-review review --diff main

# Review entire codebase
open-review review
```

## GitHub Actions

For automated PR reviews, use the [GitHub Action](https://github.com/elliottlawson/open-review-action):

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: elliottlawson/open-review-action@v1
        with:
          provider: anthropic
          model: claude-sonnet-4-20250514
          api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The Action:
1. Checks out your code
2. Runs Open Review to generate findings
3. Formats output for GitHub
4. Posts review comments to the PR

## Configuration

`.open-review.yml`:

```yaml
# LLM Settings
provider: anthropic  # or openai, openrouter
model: claude-sonnet-4-20250514

# Review Behavior
review:
  # Path to conventions file, or 'auto' to detect
  conventions: auto
  
  # Minimum severity to report: info, warning, or critical
  severity_threshold: info
  
  # Custom instructions for the reviewer
  custom_instructions: |
    - Pay special attention to SQL injection
    - All API endpoints must have rate limiting

# Files to ignore (glob patterns)
ignore:
  - "*.lock"
  - "dist/**"

# Template settings (for GitHub output)
template:
  suggestions:
    default_open: false  # collapsed by default
```

## CLI Commands

### `open-review review`

Review code locally. No GitHub integration.

```bash
# Review current directory
open-review review

# Review staged changes
open-review review --diff staged

# Review changes against main
open-review review --diff main

# Output as JSON for integration with other tools
open-review review --json
```

### `open-review init`

Initialize Open Review in a project.

```bash
open-review init
```

Creates `.open-review.yml` configuration file.

### `open-review setup-github`

Set up GitHub Actions workflow for automatic PR reviews.

```bash
open-review setup-github
```

Creates `.github/workflows/open-review.yml` workflow file.

## Output Modes

| Mode | Command | Use Case |
|------|---------|----------|
| **Human** (default) | `review` | Terminal output with colors |
| **JSON** | `review --json` | Integration with other tools/agents |
| **GitHub** | Used by Action | GitHub-flavored markdown with SVG icons |

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

## Architecture

Open Review follows a **driver architecture**:

- **Core** (`open-review`): Platform-agnostic review generation
- **Drivers** (e.g., `open-review-action`): Platform-specific orchestration

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed architecture documentation.

## Environment Variables

- `ANTHROPIC_API_KEY` - For Claude models
- `OPENAI_API_KEY` - For GPT models

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design and philosophy
- [Template System](./docs/TEMPLATE.md) - PR comment format specification
- [Decisions](./docs/DECISIONS.md) - Architectural decisions and roadmap

## License

MIT
