# Agent Guide: Open Review Core

This project is the **platform-agnostic core engine** for AI-powered code reviews. It generates structured review results from local code, which downstream drivers (GitHub Action, future CLI commands, etc.) consume and format for their platform.

## Source of Truth Documents

The authoritative contracts live in committed TypeScript source files:

| File | Purpose |
|---|---|
| `src/core/types.ts` | **Source of truth** for the JSON output contract (`ReviewResult`, `ReviewFinding`, `OutputConfig`) |
| `src/config/schema.ts` | **Source of truth** for `.open-review/config.yml` schema, defaults, and config precedence |
| `src/core/agent.ts` | **Source of truth** for agent instructions and how they map to output sections |
| `src/output/comment-template.ts` | PR comment template specification (GitHub-flavored markdown formatter) |
| `methodology/core.md` | **Source of truth** for the review methodology (6-step reasoning process) |

> **Rule**: When changing behavior, document the intended contract before modifying committed source. Update specs, then diff against the source of truth files above and apply changes. This prevents drift between intent and implementation.

## Key Files

| File | Purpose |
|---|---|
| `src/core/agent.ts` | Mastra-based review agent, prompt construction, structured output |
| `src/core/types.ts` | Shared TypeScript types (`ReviewResult`, `ReviewFinding`, config types) |
| `src/config/schema.ts` | Zod schema for `.open-review/config.yml` validation |
| `src/config/loader.ts` | Config file discovery and loading |
| `src/core/methodology-loader.ts` | Loads methodology from built-in or local files |
| `src/core/preset-loader.ts` | Loads framework presets |
| `src/core/framework-detector.ts` | Auto-detects frameworks from project files |
| `src/cli/review.ts` | Local review command (`open-review review`) |
| `src/cli/publish.ts` | Publish command (copies methodology for customization) |
| `src/output/human.ts` | Terminal formatter (ANSI colors) |
| `src/output/agent.ts` | JSON formatter (`--json` flag output) |
| `src/output/comment-template.ts` | GitHub markdown formatter |

## Design Principles

- **Local-first**: Core never calls external APIs. Reads files from local filesystem only.
- **Platform-agnostic**: No GitHub, GitLab, or platform-specific logic in core.
- **Structured output**: AI produces `ReviewResult` JSON. Formatters transform it for display.
- **Config-driven**: Behavior controlled by `.open-review/config.yml` and CLI flags.
- **Methodology-first**: The reasoning process is the product, not the tool.

## Environment

- `OPEN_REVIEW_API_KEY` — API key for the configured LLM provider

## Development

```bash
npm install
npm run build
# Test locally:
npx tsx src/cli/index.ts review --diff main --json
```

## Architecture

```
Core (open-review)
├─ Reads code from local filesystem
├─ Loads config from .open-review/config.yml
├─ Loads methodology from methodology/ (built-in or local)
├─ Loads presets from presets/ (built-in or local)
├─ Builds prompt: methodology + presets + conventions + output discipline
├─ Calls LLM (Mastra agent with structured output)
└─ Returns: ReviewResult JSON

Driver (open-review-action)
├─ Runs: open-review review --json
├─ Receives: ReviewResult
├─ Formats: GitHub markdown (via TEMPLATE_SPEC.md)
└─ Posts: via GitHub API
```

## Planning Directory

This project uses a `plans/` directory (ignored by git) to track pending and completed work:

```
plans/
├── pending/     # Work waiting to be picked up
└── complete/    # Work that has been finished
```

- **Starting work**: Check `plans/pending/` for the next spec to implement
- **Finishing work**: Move the completed plan from `plans/pending/` to `plans/complete/`

This is a lightweight coordination system for tracking what has been specced vs what has been built.

## Change Workflow

When changing core behavior:

1. Document the intended contract (update local specs before modifying committed source)
2. Update `src/core/types.ts` if the data model changes
3. Update `src/core/agent.ts` if the prompt or output structure changes
4. Update `src/config/schema.ts` if configuration changes
5. Run a local review to verify: `npx tsx src/cli/index.ts review --diff main --json`
6. Update downstream specs if the output contract changes
