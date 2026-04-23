# Open Review

AI-powered code review tool for local development and CI/CD. Reviews code using Claude or GPT, with flexible output for terminal, JSON, or platform-specific formats.

## Features

- **Local code review** - Review changes before pushing
- **CI/CD integration** - GitHub Action for PR reviews
- **Multiple LLM providers**: Anthropic Claude, OpenAI GPT-4, OpenRouter
- **Custom instruction playbooks**: Configure review behavior via instructions files and inline rules
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
  api_key: ${OPEN_REVIEW_API_KEY}  # optional, supports env var reference

# Output Settings
output:
  format: human           # "human" | "json"
  colors: auto            # "auto" | "true" | "false"
  timezone: America/New_York  # any IANA timezone string
  sections:
    must_fix:
      enabled: true
      collapse: auto      # "auto" | "always" | "never"
    should_fix:
      enabled: true
      collapse: auto
    suggestions:
      enabled: true
      collapse: auto
    questions:
      enabled: true
      collapse: auto
  verdicts:
    approve:
      label: "LGTM"
    changes_needed:
      label: "Changes Needed"
    hold:
      label: "Hold"
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

## Instructions

You can provide custom instructions to guide the reviewer's behavior:

### Via configuration file

```yaml
review:
  instructions_file: REVIEWER.md
  instructions: |
    Pay special attention to SQL injection vulnerabilities.
```

- `instructions_file`: Path to a playbook or conventions file
- `instructions`: Additional inline text (prepended to file content)

### Via CLI

```bash
open-review review --instructions-file ./security-playbook.md
open-review review --prompt "Focus on authentication logic"
```

- `--instructions-file`: Override the config's file path for this run
- `--prompt`: Add an ephemeral focus that only applies to this review

## CLI Flags

All configuration settings can be overridden via CLI flags. Flags take precedence over `.open-review.yml` config file settings.

**Precedence:** CLI flags > config file > defaults

### Review Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--diff <ref>` | string | — | Compare against git ref (`main`, `HEAD~1`, `staged`) |
| `--json` | boolean | `false` | Output JSON for agent consumption |
| `--output, -o <path>` | string | — | Write output to file |
| `--provider <name>` | string | `anthropic` | LLM provider (`anthropic`, `openai`, `openrouter`) |
| `--model <name>` | string | `claude-sonnet-4-20250514` | LLM model name |
| `--api-key <key>` | string | — | API key for the LLM provider |
| `--instructions-file <path>` | string | — | Path to instructions file |
| `--instructions "<text>"` | string | — | Inline instructions |
| `--prompt "<text>"` | string | — | Ephemeral focus for this review |
| `--config <path>` | string | — | Path to config file |
| `--verbose` | boolean | `false` | Show progress in logs |

### Output Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--timezone <tz>` | string | `America/New_York` | IANA timezone for timestamps |

### Section Visibility

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--must-fix <bool>` | boolean | `true` | Enable/disable must fix section |
| `--should-fix <bool>` | boolean | `true` | Enable/disable should fix section |
| `--suggestions <bool>` | boolean | `true` | Enable/disable suggestions section |
| `--questions <bool>` | boolean | `true` | Enable/disable questions section |

### Section Collapse

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--collapse-must-fix <mode>` | enum | `auto` | `auto`, `always`, `never` |
| `--collapse-should-fix <mode>` | enum | `auto` | `auto`, `always`, `never` |
| `--collapse-suggestions <mode>` | enum | `auto` | `auto`, `always`, `never` |
| `--collapse-questions <mode>` | enum | `auto` | `auto`, `always`, `never` |

### Verdict Labels

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--label-approve <text>` | string | `LGTM` | Label for approve verdict |
| `--label-changes-needed <text>` | string | `Changes Needed` | Label for changes_needed verdict |
| `--label-hold <text>` | string | `Hold` | Label for hold verdict |

### Examples

```bash
# Hide suggestions section
open-review review --diff main --suggestions=false

# Set timezone
open-review review --diff main --timezone Europe/London

# Customize verdict labels
open-review review --diff main --label-approve "Ship It" --label-hold "Needs discussion"

# Collapse all sections
open-review review --diff main --collapse-must-fix=always --collapse-suggestions=always

# Parameterized (e.g., in a GitHub Action)
open-review review --diff main --must-fix=${{ inputs.must_fix }} --timezone=${{ inputs.timezone }}
```

## Architecture

Open Review follows a **driver architecture**:

- **Core** (`open-review`): Platform-agnostic review generation. Reads local files, calls LLM, returns structured JSON.
- **Drivers** (e.g., `open-review-action`): Platform-specific orchestration. Formats and posts reviews.

The core never calls external APIs or posts comments. Platform-specific concerns are handled by drivers.

## Environment Variables

- `OPEN_REVIEW_API_KEY` - API key for the configured LLM provider

## License

MIT
