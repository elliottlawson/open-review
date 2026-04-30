# Open Review

A battle-tested methodology for AI-assisted code review, delivered as a harness, skills, and presets.

Open Review is not just a code review tool. It provides a structured reasoning process that guides AI agents to produce consistent, high-quality reviews. The quality depends on the model, context, instructions, and codebase — we provide the structure.

## Three Modes of Operation

| Mode | Context | What We Deliver |
|---|---|---|
| **CI/CD** | No agent present | Harness runs automated reviews via GitHub Action |
| **Local CLI** | Developer wants quick check | Harness script for terminal use |
| **Existing Agent** | Developer uses Cursor/Claude Code/Open Code | Methodology as agent instructions (skill) |

## Quick Start

### Zero Config

```bash
npm install -g open-review
open-review review --diff main
```

Works immediately with built-in methodology, auto-detected presets, and default settings.

### With Init Wizard

```bash
cd your-project
open-review init
```

This creates:
- `.open-review/config.yml` — Configuration file
- `.open-review/presets/` — Framework-specific presets (if detected)
- Agent skill files (`.cursorrules`, `CLAUDE.md`, `AGENTS.md`)
- `.github/workflows/open-review.yml` — GitHub Action workflow

### Set API Key

```bash
export OPEN_REVIEW_API_KEY=your_key_here
```

## Configuration

`.open-review/config.yml`:

```yaml
version: "1.0"

review:
  methodology: default      # 'default' (built-in) or path to custom file
  presets: auto             # 'auto' (detect) or [laravel, react]
  conventions: auto         # 'auto' (discover), path, or inline text

# LLM Settings (optional)
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514

# Output Settings (optional)
output:
  format: human
  timezone: America/New_York
```

### Conventions

The `conventions` field supports three values:

```yaml
# Auto-discover from codebase
conventions: auto

# Path to conventions file
conventions: ./docs/standards.md

# Inline text
conventions: "We use HasRealm for tenancy. Controllers are CRUD-only."
```

## CLI Commands

### `open-review init`

Interactive wizard to set up Open Review in your project.

### `open-review publish`

Copy built-in methodology files to `.open-review/methodology/` for customization.

```bash
open-review publish
```

### `open-review review`

Run a code review.

```bash
# Review changes against main
open-review review --diff main

# Review staged changes
open-review review --diff staged

# JSON output for agents
open-review review --diff main --json

# Ephemeral focus
open-review review --diff main --prompt "Focus on authentication"
```

## Agent Skills

Open Review generates thin skill files that point to your config:

- `.cursorrules` — For Cursor
- `CLAUDE.md` — For Claude Code
- `AGENTS.md` — For Open Code
- `.ai/instructions.md` — Generic

Skills are identical across projects. The agent reads the skill, reads the config, and executes the review.

## Presets

Framework-specific review guides that add awareness at step 3 of the methodology.

Built-in presets: Laravel, React, Next.js, Vue.

```bash
# Auto-detected during init
open-review init

# Or specify in config
review:
  presets: [laravel, react]
```

Presets are copied to `.open-review/presets/` where agents can read them.

## GitHub Action

For automated PR reviews:

```yaml
name: Open Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: elliottlawson/open-review-action@v1
        with:
          api_key: ${{ secrets.OPEN_REVIEW_API_KEY }}
```

## Architecture

```
open-review/
├── methodology/              # Core reasoning process (source of truth)
│   ├── core.md
│   ├── output-discipline.md
│   └── communication-style.md
│
├── skills/                   # Agent-specific instruction files
│   ├── cursor.md
│   ├── claude-code.md
│   ├── open-code.md
│   └── generic.md
│
├── presets/                  # Framework-specific review guides
│   ├── laravel.md
│   ├── react.md
│   ├── nextjs.md
│   └── vue.md
│
├── src/                      # The harness (TypeScript implementation)
│   ├── config/
│   ├── core/
│   ├── cli/
│   └── output/
│
└── templates/                # Config and workflow templates
    ├── config.yml
    └── workflow.yml
```

## Environment Variables

- `OPEN_REVIEW_API_KEY` — API key for the configured LLM provider

## License

MIT
