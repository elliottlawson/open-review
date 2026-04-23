/**
 * Setup GitHub Command
 *
 * Creates GitHub Action workflow for PR reviews.
 * Separate from init since users might want local-only usage.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfigFromFile, type ResolvedConfig } from '../config/loader.js';

// ============================================================================
// Types
// ============================================================================

interface SetupGithubArgs {
  quick: boolean;
  force: boolean;
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseSetupGithubArgs(args: string[]): SetupGithubArgs {
  const flags: SetupGithubArgs = {
    quick: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--quick' || arg === '-y') {
      flags.quick = true;
    } else if (arg === '--force' || arg === '-f') {
      flags.force = true;
    }
  }

  return flags;
}

// ============================================================================
// Workflow Generation
// ============================================================================

function generateWorkflow(provider: string, model: string): string {
  return `name: Open Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: elliottlawson/open-review-action@main
        with:
          provider: ${provider}
          model: ${model}
          api_key: \${{ secrets.OPEN_REVIEW_API_KEY }}
`;
}

// ============================================================================
// Interactive Setup (for config detection)
// ============================================================================

interface ConfirmConfig {
  provider: string;
  model: string;
}

async function promptForConfig(fileConfig: ResolvedConfig): Promise<ConfirmConfig> {
  // For now, use fileConfig directly. Could add interactive prompts later.
  console.log(`📄 Using config: provider=${fileConfig.llm.provider}, model=${fileConfig.llm.model}`);

  return {
    provider: fileConfig.llm.provider,
    model: fileConfig.llm.model,
  };
}

// ============================================================================
// File Writing
// ============================================================================

function writeWorkflow(cwd: string, config: ConfirmConfig): void {
  console.log('\n📝 Creating GitHub Action workflow...\n');

  // Workflow file
  const workflowDir = join(cwd, '.github', 'workflows');
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }
  const workflowContent = generateWorkflow(config.provider, config.model);
  writeFileSync(join(workflowDir, 'open-review.yml'), workflowContent);
  console.log('   ✓ Created .github/workflows/open-review.yml');
}

function printNextSteps(): void {
  console.log('\n' + '='.repeat(50));
  console.log('✅ GitHub Action workflow created!\n');
  console.log('Next steps:\n');

  console.log('1. Add your API key to GitHub Secrets:');
  console.log('   Go to: Settings → Secrets and variables → Actions');
  console.log('   Add secret: OPEN_REVIEW_API_KEY');

  console.log('\n2. Push the workflow file:');
  console.log('   git add .github/workflows/open-review.yml');
  console.log('   git commit -m "Add Open Review GitHub Action"');
  console.log('   git push');

  console.log('\n3. Open a PR to see it in action!');
  console.log('');
}

// ============================================================================
// Quick Setup
// ============================================================================

async function runQuickSetup(cwd: string, args: SetupGithubArgs, config: ResolvedConfig): Promise<void> {
  console.log('\n🔧 Open Review GitHub Action Setup\n');

  // Use defaults from config
  const workflowConfig = {
    provider: config.llm.provider,
    model: config.llm.model,
  };

  writeWorkflow(cwd, workflowConfig);
  printNextSteps();
}

// ============================================================================
// Main Function
// ============================================================================

export async function runSetupGithub(cwd: string = process.cwd(), args: SetupGithubArgs = { quick: false, force: false }): Promise<void> {
  // Check if workflow already exists
  const workflowPath = join(cwd, '.github/workflows/open-review.yml');
  const workflowExists = existsSync(workflowPath);

  if (workflowExists && !args.force) {
    console.log('⚠️  GitHub Action workflow already exists');
    console.log('   Use --force to overwrite existing file.');
    console.log(`   Path: ${workflowPath}`);
    process.exit(1);
  }

  // Load config
  const { config: fileConfig, errors } = loadConfigFromFile(cwd);

  if (errors.length > 0) {
    console.error('Config errors (run "open-review init" first):');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Quick mode or interactive
  if (args.quick) {
    await runQuickSetup(cwd, args, fileConfig);
  } else {
    // For now, quick setup is the same. Could add interactive options later.
    await runQuickSetup(cwd, args, fileConfig);
  }
}