/**
 * Local Review Command
 * 
 * Reviews code locally without GitHub integration.
 * Uses the Mastra-based agent to explore and review the codebase.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { runReview, type ReviewInput } from '../core/agent.js';
import { formatForHuman } from '../output/human.js';
import { toJSON } from '../output/agent.js';

// ============================================================================
// CLI Arguments
// ============================================================================

export interface ReviewArgs {
  /** Path to review (defaults to current directory) */
  path: string;
  /** Compare against this ref (e.g., 'main', 'HEAD~1') */
  diff?: string;
  /** Output format */
  format: 'human' | 'json';
  /** Model to use */
  model: string;
  /** Max steps for agent */
  maxSteps: number;
  /** Show progress */
  verbose: boolean;
  /** Custom instructions file */
  instructions?: string;
}

export function parseReviewArgs(args: string[]): ReviewArgs {
  const result: ReviewArgs = {
    path: process.cwd(),
    format: 'human',
    model: 'anthropic/claude-sonnet-4-20250514',
    maxSteps: 100,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json' || arg === '--agent') {
      result.format = 'json';
    } else if (arg === '--diff' || arg === '-d') {
      result.diff = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--max-steps') {
      result.maxSteps = parseInt(args[++i], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--instructions' || arg === '-i') {
      result.instructions = args[++i];
    } else if (!arg.startsWith('-')) {
      result.path = path.resolve(arg);
    }
  }

  return result;
}

// ============================================================================
// Git Helpers
// ============================================================================

function getGitDiff(basePath: string, ref?: string): { diff: string; files: string[] } | null {
  try {
    const compareRef = ref || 'HEAD';
    
    // Get list of changed files
    const filesOutput = execSync(
      `git diff --name-only ${compareRef}`,
      { cwd: basePath, encoding: 'utf-8' }
    ).trim();
    
    if (!filesOutput) {
      return null;
    }
    
    const files = filesOutput.split('\n').filter(Boolean);
    
    // Get the diff
    const diff = execSync(
      `git diff ${compareRef}`,
      { cwd: basePath, encoding: 'utf-8' }
    );
    
    return { diff, files };
  } catch (error) {
    return null;
  }
}

function getStagedDiff(basePath: string): { diff: string; files: string[] } | null {
  try {
    const filesOutput = execSync(
      'git diff --cached --name-only',
      { cwd: basePath, encoding: 'utf-8' }
    ).trim();
    
    if (!filesOutput) {
      return null;
    }
    
    const files = filesOutput.split('\n').filter(Boolean);
    
    const diff = execSync(
      'git diff --cached',
      { cwd: basePath, encoding: 'utf-8' }
    );
    
    return { diff, files };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Load Instructions
// ============================================================================

function loadInstructions(basePath: string, instructionsPath?: string): string | undefined {
  // Check explicit path first
  if (instructionsPath) {
    const fullPath = path.resolve(basePath, instructionsPath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
  }

  // Check for conventions file in common locations
  const conventionsPaths = [
    '.open-review/CONVENTIONS.md',
    'CONVENTIONS.md',
    '.github/CONVENTIONS.md',
    'docs/CONVENTIONS.md',
    'CLAUDE.md', // Common for Claude-based tools
  ];

  for (const p of conventionsPaths) {
    const fullPath = path.join(basePath, p);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
  }

  return undefined;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handleReview(args: ReviewArgs): Promise<void> {
  // Validate path exists
  if (!fs.existsSync(args.path)) {
    console.error(`Error: Path does not exist: ${args.path}`);
    process.exit(1);
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY && args.model.startsWith('anthropic/')) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  // Determine what to review
  let reviewInput: ReviewInput;
  
  if (args.diff) {
    // Review changes against a ref
    const changes = args.diff === 'staged' 
      ? getStagedDiff(args.path)
      : getGitDiff(args.path, args.diff);
    
    if (!changes) {
      console.log('No changes to review.');
      process.exit(0);
    }

    reviewInput = {
      target: `Review the changes in this diff. Focus on the modified code.`,
      changedFiles: changes.files,
      diff: changes.diff,
    };
    
    if (args.verbose) {
      console.log(`Reviewing ${changes.files.length} changed files against ${args.diff}`);
    }
  } else {
    // Review the whole codebase or let the agent explore
    reviewInput = {
      target: 'Explore this codebase and review the code quality. Look for bugs, security issues, and areas for improvement.',
    };
    
    if (args.verbose) {
      console.log(`Reviewing codebase at ${args.path}`);
    }
  }

  // Load instructions
  const instructions = loadInstructions(args.path, args.instructions);

  if (args.verbose) {
    console.log(`Model: ${args.model}`);
    console.log(`Max steps: ${args.maxSteps}`);
    if (instructions) {
      console.log('Using custom conventions file');
    }
    console.log('');
  }

  // Run the review
  try {
    const result = await runReview(
      {
        basePath: args.path,
        model: args.model,
        maxSteps: args.maxSteps,
        instructions,
        onStep: args.verbose ? (step) => {
          for (const call of step.toolCalls) {
            const argsPreview = JSON.stringify(call.args).slice(0, 60);
            console.log(`  [${step.stepNumber}] ${call.name}(${argsPreview}...)`);
          }
        } : undefined,
      },
      reviewInput
    );

    // Output results
    if (args.format === 'json') {
      console.log(toJSON(result, true));
    } else {
      console.log(formatForHuman(result));
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}
