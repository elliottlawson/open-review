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
export OPEN_REVIEW_API_KEY=your_key_here
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
          api_key: ${{ secrets.OPEN_REVIEW_API_KEY }}
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
llm:
  provider: anthropic  # or openai, openrouter
  model: claude-sonnet-4-20250514
  api_key: ${OPEN_REVIEW_API_KEY}  # optional, supports env var interpolation

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

The reviewer auto-detects instruction files in this order:
1. `.open-review/CONVENTIONS.md`
2. `CONVENTIONS.md`
3. `.github/CONVENTIONS.md`
4. `docs/CONVENTIONS.md`
5. `CLAUDE.md`

Or specify an explicit path in `.open-review.yml`:
```yaml
review:
  instructions_file: path/to/your/conventions.md
```

When found, the content is injected into the agent prompt as project-specific instructions.

## Architecture

Open Review follows a **driver architecture**:

- **Core** (`open-review`): Platform-agnostic review generation. Reads local files, calls LLM, returns structured JSON.
- **Drivers** (e.g., `open-review-action`): Platform-specific orchestration. Formats and posts reviews.

The core never calls external APIs or posts comments. Platform-specific concerns are handled by drivers.

## Environment Variables

- `OPEN_REVIEW_API_KEY` - API key for the configured LLM provider

## License

MIT
