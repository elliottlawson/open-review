#!/usr/bin/env node

/**
 * Open Review CLI
 * 
 * Usage:
 *   open-review init                Set up Open Review in current repo
 *   open-review pr <owner/repo#N>   Review a pull request
 *   open-review pr <number>         (uses current repo)
 *   open-review pr <url>            (GitHub URL)
 * 
 * Options:
 *   --dry-run    Don't post comments, just show what would be posted
 *   --verbose    Show detailed progress
 *   --model      Override the LLM model
 *   --provider   Override the LLM provider
 */

import 'dotenv/config';
import { createReviewer } from '../core/reviewer.js';
import { loadConfigFromFile, type ResolvedConfig } from '../config/loader.js';
import { runInit } from './init.js';
import type { OpenReviewConfig } from '../core/types.js';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIArgs {
  command: string;
  target?: string;
  dryRun: boolean;
  verbose: boolean;
  model?: string;
  provider?: 'anthropic' | 'openai' | 'openrouter';
  help: boolean;
}

function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    command: '',
    dryRun: false,
    verbose: false,
    help: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--provider' || arg === '-p') {
      result.provider = args[++i] as CLIArgs['provider'];
    } else if (!result.command) {
      result.command = arg;
    } else if (!result.target) {
      result.target = arg;
    }
  }
  
  return result;
}

// ============================================================================
// PR Reference Parsing
// ============================================================================

interface PRRef {
  owner: string;
  repo: string;
  number: number;
}

function parsePRRef(target: string): PRRef | null {
  // Format: owner/repo#123
  const shortMatch = target.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10),
    };
  }
  
  // Format: https://github.com/owner/repo/pull/123
  const urlMatch = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: parseInt(urlMatch[3], 10),
    };
  }
  
  // Format: just a number (needs owner/repo from elsewhere)
  const numberMatch = target.match(/^(\d+)$/);
  if (numberMatch) {
    // Try to get from env or git
    const owner = process.env.GITHUB_REPOSITORY_OWNER;
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
    if (owner && repo) {
      return {
        owner,
        repo,
        number: parseInt(numberMatch[1], 10),
      };
    }
    return null;
  }
  
  return null;
}

// ============================================================================
// Help Text
// ============================================================================

function showHelp(): void {
  console.log(`
Open Review - AI-powered PR code review

Commands:
  open-review init              Set up Open Review in current repository
  open-review pr <target>       Review a pull request

Target formats:
  owner/repo#123              Short format
  https://github.com/.../123  Full URL
  123                         PR number (requires GITHUB_REPOSITORY env)

Options:
  -n, --dry-run     Don't post comments, just show what would be posted
  -v, --verbose     Show detailed progress
  -m, --model       Override the LLM model (e.g., claude-sonnet-4-20250514)
  -p, --provider    Override the LLM provider (anthropic, openai, openrouter)
  -h, --help        Show this help message

Configuration:
  Place a .open-review.yml file in your repo root to configure behavior.
  Run 'open-review init' to create one interactively.

Environment variables:
  GITHUB_TOKEN          GitHub API token (required)
  ANTHROPIC_API_KEY     Anthropic API key (for Claude models)
  OPENAI_API_KEY        OpenAI API key (for GPT models)
  LINEAR_API_KEY        Linear API key (optional, for issue context)

Examples:
  open-review init
  open-review pr owner/repo#123
  open-review pr https://github.com/owner/repo/pull/123
  open-review pr owner/repo#123 --dry-run --verbose
  open-review pr owner/repo#123 --model claude-opus-4-20250514
`);
}

// ============================================================================
// Config Loading
// ============================================================================

function buildRuntimeConfig(args: CLIArgs, fileConfig: ResolvedConfig): OpenReviewConfig {
  // Check for required env vars
  if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Get a token at: https://github.com/settings/tokens');
    process.exit(1);
  }
  
  // Start with file config, allow CLI args to override
  let provider = fileConfig.llm.provider;
  let model = fileConfig.llm.model;
  
  // CLI overrides
  if (args.provider) {
    provider = args.provider;
  }
  if (args.model) {
    model = args.model;
  }
  
  // Auto-detect provider from available API keys if not explicitly set
  if (!args.provider && fileConfig.llm.provider === 'anthropic') {
    if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      provider = 'openai';
      model = 'gpt-4o';
    }
  }
  
  // Check for LLM API key
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }
  
  const config: OpenReviewConfig = {
    llm: {
      provider,
      model,
    },
    github: {
      token: process.env.GITHUB_TOKEN,
    },
    review: {
      postComments: !args.dryRun,
      flagEmptyDescription: fileConfig.review.flag_empty_description,
      instructionsFile: fileConfig.review.instructions_file,
      instructions: fileConfig.review.instructions,
      ignore: fileConfig.ignore,
    },
  };
  
  // Add Linear if configured and enabled
  if (fileConfig.linear.enabled && process.env.LINEAR_API_KEY) {
    config.linear = {
      apiKey: process.env.LINEAR_API_KEY,
    };
  }
  
  return config;
}

// ============================================================================
// Main Command Handlers
// ============================================================================

async function handlePRReview(args: CLIArgs): Promise<void> {
  if (!args.target) {
    console.error('Error: PR target is required');
    console.error('Usage: open-review pr <owner/repo#number>');
    process.exit(1);
  }
  
  const prRef = parsePRRef(args.target);
  if (!prRef) {
    console.error(`Error: Invalid PR reference: ${args.target}`);
    console.error('Expected format: owner/repo#123 or GitHub URL');
    process.exit(1);
  }
  
  // Load config from file (if exists)
  const { config: fileConfig, configPath, errors } = loadConfigFromFile();
  
  if (errors.length > 0) {
    console.error('Config errors:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  
  if (args.verbose && configPath) {
    console.log(`📄 Using config: ${configPath}`);
  }
  
  const config = buildRuntimeConfig(args, fileConfig);
  const reviewer = createReviewer(config);
  
  console.log(`\n🔍 Open Review`);
  console.log(`   Repository: ${prRef.owner}/${prRef.repo}`);
  console.log(`   PR: #${prRef.number}`);
  console.log(`   Provider: ${config.llm.provider} (${config.llm.model})`);
  if (args.dryRun) console.log(`   Mode: Dry run`);
  console.log('');
  
  try {
    const output = await reviewer.review({
      owner: prRef.owner,
      repo: prRef.repo,
      prNumber: prRef.number,
      dryRun: args.dryRun,
      verbose: args.verbose,
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Review Complete');
    console.log('='.repeat(60));
    console.log(`\nReview ID: ${output.reviewId}`);
    console.log(`PR: ${output.prContext.title}`);
    console.log(`Recommendation: ${output.result.recommendation.toUpperCase()}`);
    console.log(`Findings: ${output.result.findings.length}`);
    console.log(`Tokens used: ${output.result.tokensUsed}`);
    
    if (output.commentId) {
      console.log(`\nComment posted: https://github.com/${prRef.owner}/${prRef.repo}/pull/${prRef.number}#issuecomment-${output.commentId}`);
    }
    
    if (args.dryRun) {
      console.log('\n--- GitHub Comment Preview ---');
      console.log(output.formattedComment);
      console.log('--- End Preview ---');
    }
    
    console.log('');
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
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
      await runInit();
      break;
      
    case 'pr':
    case 'review':
      await handlePRReview(args);
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
