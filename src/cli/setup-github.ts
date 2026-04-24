/**
 * Setup GitHub Command
 *
 * Creates GitHub Action workflow for PR reviews.
 * Separate from init since users might want local-only usage.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
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

function generateWorkflow(): string {
  return `name: Open Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    name: AI Code Review
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Open Review
        uses: elliottlawson/open-review-action@v1
        with:
          api_key: \${{ secrets.OPEN_REVIEW_API_KEY }}
`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function promptYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: boolean = true
): Promise<boolean> {
  const hint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await prompt(rl, `${question} ${hint}: `);
  if (!answer) return defaultValue;
  return answer.toLowerCase().startsWith('y');
}

// ============================================================================
// File Writing
// ============================================================================

function writeWorkflow(cwd: string): void {
  console.log('\n📝 Creating GitHub Action workflow...\n');

  const workflowDir = join(cwd, '.github', 'workflows');
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }
  const workflowContent = generateWorkflow();
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

  console.log('\n2. Ensure .open-review.yml is committed:');
  console.log('   git add .open-review.yml');

  console.log('\n3. Push the workflow file:');
  console.log('   git add .github/workflows/open-review.yml');
  console.log('   git commit -m "Add Open Review GitHub Action"');
  console.log('   git push');

  console.log('\n4. Open a PR to see it in action!');
  console.log('');
}

// ============================================================================
// Main Function
// ============================================================================

export async function runSetupGithub(cwd: string = process.cwd(), args: SetupGithubArgs = { quick: false, force: false }): Promise<void> {
  // Check if workflow already exists
  const workflowPath = join(cwd, '.github/workflows/open-review.yml');
  const workflowExists = existsSync(workflowPath);

  if (workflowExists && !args.force) {
    if (args.quick) {
      console.log('⚠️  GitHub Action workflow already exists');
      console.log('   Use --force to overwrite existing file.');
      console.log(`   Path: ${workflowPath}`);
      process.exit(1);
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n🔧 Open Review GitHub Action Setup\n');
    console.log('⚠️  Existing workflow detected:');
    console.log(`   ${workflowPath}`);

    const overwrite = await promptYesNo(rl, 'Overwrite existing workflow?', false);
    rl.close();

    if (!overwrite) {
      console.log('\nSetup cancelled.');
      return;
    }
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

  if (!args.quick) {
    console.log('\n🔧 Open Review GitHub Action Setup\n');
    console.log(`📄 Using config: provider=${fileConfig.llm.provider}, model=${fileConfig.llm.model}`);
    console.log('\nThis will create .github/workflows/open-review.yml');
    console.log('The workflow uses your existing .open-review.yml for configuration.');
  }

  writeWorkflow(cwd);
  printNextSteps();
}
