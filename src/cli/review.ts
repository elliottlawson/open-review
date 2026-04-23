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
import { loadConfigFromFile, loadConfigFromString, type LoadConfigResult } from '../config/loader.js';
import type { ResolvedConfig } from '../config/schema.js';

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
  /** LLM provider (anthropic, openai, openrouter) */
  provider?: string;
  /** Model name (without provider prefix) */
  model?: string;
  /** Show progress */
  verbose: boolean;
  /** Custom instructions file */
  instructions?: string;
  /** Path to config file */
  configPath?: string;
}

export function parseReviewArgs(args: string[]): ReviewArgs {
  const result: ReviewArgs = {
    path: process.cwd(),
    format: 'human',
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json' || arg === '--agent') {
      result.format = 'json';
    } else if (arg === '--diff' || arg === '-d') {
      result.diff = args[++i];
    } else if (arg === '--provider' || arg === '-p') {
      result.provider = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      result.configPath = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--instructions' || arg === '-i') {
      result.instructions = args[++i];
    } else if (!arg.startsWith('-')) {
      result.path = path.resolve(arg);
    }
  }

  // Validate provider/model coupling
  if ((result.provider && !result.model) || (!result.provider && result.model)) {
    console.error('Error: --provider and --model must be provided together');
    process.exit(1);
  }

  return result;
}

// ============================================================================
// Git Helpers
// ============================================================================

/**
 * Simple glob matching supporting * (within segment) and ** (across segments)
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Normalize separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob to regex
  const regexStr = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

function filterIgnoredFiles(files: string[], ignorePatterns: string[]): string[] {
  if (ignorePatterns.length === 0) return files;
  return files.filter(file => !ignorePatterns.some(pattern => matchesGlob(file, pattern)));
}

function getGitDiff(basePath: string, ref?: string, ignorePatterns: string[] = []): { diff: string; files: string[] } | null {
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
    
    const allFiles = filesOutput.split('\n').filter(Boolean);
    const files = filterIgnoredFiles(allFiles, ignorePatterns);
    
    if (files.length === 0) {
      return null;
    }
    
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

function getStagedDiff(basePath: string, ignorePatterns: string[] = []): { diff: string; files: string[] } | null {
  try {
    const filesOutput = execSync(
      'git diff --cached --name-only',
      { cwd: basePath, encoding: 'utf-8' }
    ).trim();
    
    if (!filesOutput) {
      return null;
    }
    
    const allFiles = filesOutput.split('\n').filter(Boolean);
    const files = filterIgnoredFiles(allFiles, ignorePatterns);
    
    if (files.length === 0) {
      return null;
    }
    
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

  // Load config
  const configResult: LoadConfigResult = args.configPath
    ? (() => {
        const fullPath = path.resolve(args.configPath!);
        if (!fs.existsSync(fullPath)) {
          console.error(`Error: Config file does not exist: ${fullPath}`);
          process.exit(1);
        }
        return loadConfigFromString(fs.readFileSync(fullPath, 'utf-8'));
      })()
    : loadConfigFromFile(args.path);

  // Handle config errors
  if (configResult.errors.length > 0) {
    for (const error of configResult.errors) {
      console.error(`Config error: ${error}`);
    }
    process.exit(1);
  }

  const config: ResolvedConfig = configResult.config;

  // Resolve provider and model with precedence: CLI > config > default
  const provider = args.provider || config.llm.provider;
  const model = args.model || config.llm.model;
  const fullModel = `${provider}/${model}`;

  // Validate API key for resolved provider
  const keyMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  const requiredKey = keyMap[provider];
  if (requiredKey && !process.env[requiredKey]) {
    console.error(`Error: ${requiredKey} environment variable is required for provider '${provider}'`);
    process.exit(1);
  }

  // Determine what to review
  let reviewInput: ReviewInput;
  const ignorePatterns = config.ignore;
  
  if (args.diff) {
    // Review changes against a ref
    const changes = args.diff === 'staged' 
      ? getStagedDiff(args.path, ignorePatterns)
      : getGitDiff(args.path, args.diff, ignorePatterns);
    
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
    const ignorePrompt = ignorePatterns.length > 0
      ? `\n\n## Ignore Patterns\nDo not review files matching these patterns:\n${ignorePatterns.map(p => `- ${p}`).join('\n')}`
      : '';

    reviewInput = {
      target: `Explore this codebase and review the code quality. Look for bugs, security issues, and areas for improvement.${ignorePrompt}`,
    };
    
    if (args.verbose) {
      console.log(`Reviewing codebase at ${args.path}`);
    }
  }

  // Load instructions
  const instructions = loadInstructions(args.path, args.instructions);

  if (args.verbose) {
    console.log(`Model: ${fullModel}`);
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
        model: fullModel,
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
