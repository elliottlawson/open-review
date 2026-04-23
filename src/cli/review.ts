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
  /** API key for the LLM provider */
  apiKey?: string;
  /** Show progress */
  verbose: boolean;
  /** Path to instructions/playbook file */
  instructionsFile?: string;
  /** Inline instructions text */
  instructions?: string;
  /** Ephemeral focus for this review only */
  prompt?: string;
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
    } else if (arg === '--api-key') {
      result.apiKey = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      result.configPath = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--instructions-file') {
      result.instructionsFile = args[++i];
    } else if (arg === '--instructions') {
      result.instructions = args[++i];
    } else if (arg === '--prompt') {
      result.prompt = args[++i];
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

interface ResolvedInstructions {
  fileContent?: string;
  inlineText?: string;
}

function loadInstructions(
  basePath: string,
  filePath: string | undefined,
  inlineText: string | undefined
): ResolvedInstructions {
  const result: ResolvedInstructions = {};

  if (filePath) {
    const fullPath = path.resolve(basePath, filePath);
    if (fs.existsSync(fullPath)) {
      result.fileContent = fs.readFileSync(fullPath, 'utf-8');
    }
  }

  if (inlineText) {
    result.inlineText = inlineText;
  }

  return result;
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

  // Resolve API key with precedence: CLI > config > OPEN_REVIEW_API_KEY env var
  const resolvedApiKey = args.apiKey ?? config.llm.api_key ?? process.env.OPEN_REVIEW_API_KEY;

  // Resolve provider and model with precedence: CLI > config > default
  const provider = args.provider || config.llm.provider;
  const model = args.model || config.llm.model;
  const fullModel = `${provider}/${model}`;

  // Validate API key
  if (!resolvedApiKey) {
    console.error('Error: API key required');
    console.error('Provide via --api-key, llm.api_key in config, or OPEN_REVIEW_API_KEY environment variable');
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

  // Resolve instructions with precedence: CLI > config
  const instructionsFile = args.instructionsFile ?? config.review.instructions_file;
  const instructionsInline = args.instructions ?? config.review.instructions;
  const { fileContent, inlineText } = loadInstructions(args.path, instructionsFile, instructionsInline);

  if (args.verbose) {
    console.log(`Model: ${fullModel}`);
    if (fileContent || inlineText) {
      console.log('Using custom instructions');
    }
    console.log('');
  }

    // Run the review
  try {
    const result = await runReview(
      {
        basePath: args.path,
        model: fullModel,
        apiKey: resolvedApiKey,
        instructions: inlineText,
        instructionsFile: fileContent,
        prompt: args.prompt,
        sections: {
          must_fix: { enabled: config.output.sections.must_fix.enabled },
          should_fix: { enabled: config.output.sections.should_fix.enabled },
          suggestions: { enabled: config.output.sections.suggestions.enabled },
          questions: { enabled: config.output.sections.questions.enabled },
        },
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
      console.log(toJSON(result, true, config.output));
    } else {
      console.log(formatForHuman(result, config.output));
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}
