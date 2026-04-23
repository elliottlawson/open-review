#!/usr/bin/env node

/**
 * Open Review CLI
 *
 * Usage:
 *   open-review init                Set up Open Review in current repo
 *   open-review review [path]       Review code locally (uses Mastra agent)
 *   open-review setup-github        Create GitHub Action workflow for PR reviews
 *
 * Options:
 *   --verbose    Show detailed progress
 *   --model      Override the LLM model
 *   --provider   Override the LLM provider
 */

import 'dotenv/config';
import { runInit, parseInitArgs } from './init.js';
import { handleReview, parseReviewArgs } from './review.js';
import { runSetupGithub, parseSetupGithubArgs } from './setup-github.js';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIArgs {
  command: string;
  help: boolean;
}

function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    command: '',
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (!result.command) {
      result.command = arg;
    }
  }

  return result;
}



// ============================================================================
// Help Text
// ============================================================================

function showHelp(): void {
  console.log(`
Open Review - AI-powered code review

Commands:
  open-review init              Set up Open Review in current repository
  open-review review [path]     Review code locally (uses Mastra agent)
  open-review setup-github      Create GitHub Action workflow for PR reviews

Init options:
  -y, --quick             Non-interactive setup with defaults
  -f, --force             Overwrite existing files without asking
  -p, --provider <name>   LLM provider (anthropic, openai)
  -m, --model <name>      LLM model name

Review options:
  --diff <ref>                Compare against git ref (e.g., main, HEAD~1, staged)
  --json, --agent             Output token-efficient JSON for agent consumption
  --output, -o <path>         Write output to file instead of stdout
  --provider <name>           LLM provider (anthropic, openai, openrouter)
  --model <name>              LLM model name (e.g., claude-sonnet-4-20250514)
  --api-key <key>             API key for the LLM provider
  --instructions-file <path>  Path to instructions/playbook file
  --instructions "<text>"     Inline instructions (overrides config)
  --prompt "<text>"           Ephemeral focus for this review only
  --config <path>             Path to .open-review.yml config file
  --timezone <tz>             IANA timezone (e.g., America/New_York, Europe/London)
  
  Section visibility (true/false):
  --must-fix <bool>           Show must_fix section (default: true)
  --should-fix <bool>         Show should_fix section (default: true)
  --suggestions <bool>        Show suggestions section (default: true)
  --questions <bool>          Show questions section (default: true)
  
  Section collapse (auto/always/never):
  --collapse-must-fix <mode>  Collapse must_fix section
  --collapse-should-fix <mode> Collapse should_fix section
  --collapse-suggestions <mode> Collapse suggestions section
  --collapse-questions <mode> Collapse questions section
  
  Verdict labels:
  --label-approve <text>      Label for approve verdict (default: "LGTM")
  --label-changes-needed <text> Label for changes_needed verdict
  --label-hold <text>         Label for hold verdict

Setup-github options:
  -y, --quick             Non-interactive setup with defaults
  -f, --force             Overwrite existing workflow

Options:
  -h, --help              Show this help message

Configuration:
  Place a .open-review.yml file in your repo root to configure behavior.
  Run 'open-review init' to create one interactively.

Output configuration (.open-review.yml):
  output:
    format: human           # "human" | "json"
    colors: auto            # "auto" | "true" | "false"
    timezone: America/New_York  # any IANA timezone string
    path: ./reviews/latest.json  # optional, write output to file
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

Environment variables:
  OPEN_REVIEW_API_KEY     API key for the configured LLM provider

Examples:
  open-review init
  open-review review --diff main
  open-review review --json
  open-review review --diff main --output ./results.json
  open-review review --diff main -o ./review.md
  open-review setup-github
`);
}





// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help || !args.command) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }
  
  switch (args.command) {
    case 'init':
      const initFlags = parseInitArgs(process.argv.slice(3));
      await runInit(process.cwd(), initFlags);
      break;

    case 'review':
      // New local review command using Mastra agent
      const reviewArgs = parseReviewArgs(process.argv.slice(3));
      await handleReview(reviewArgs);
      break;

    case 'setup-github':
      // Create GitHub Action workflow
      const setupArgs = parseSetupGithubArgs(process.argv.slice(3));
      await runSetupGithub(process.cwd(), setupArgs);
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
