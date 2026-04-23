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
  --diff <ref>            Compare against git ref (e.g., main, HEAD~1, staged)
  --json, --agent         Output token-efficient JSON for agent consumption
  --provider <name>       LLM provider (anthropic, openai, openrouter)
  --model <name>          LLM model name (e.g., claude-sonnet-4-20250514)
  --instructions <file>   Path to conventions/instructions file
  --config <path>         Path to .open-review.yml config file

Setup-github options:
  -y, --quick             Non-interactive setup with defaults
  -f, --force             Overwrite existing workflow

Options:
  -h, --help              Show this help message

Configuration:
  Place a .open-review.yml file in your repo root to configure behavior.
  Run 'open-review init' to create one interactively.

Environment variables:
  ANTHROPIC_API_KEY     Anthropic API key (for Claude models)
  OPENAI_API_KEY        OpenAI API key (for GPT models)

Examples:
  open-review init
  open-review review --diff main
  open-review review --json
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
