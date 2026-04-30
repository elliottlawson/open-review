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
import { renderComment } from '../output/comment-template.js';
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
  /** Whether --json flag was explicitly passed */
  jsonExplicit: boolean;
  /** LLM provider (anthropic, openai, openrouter) */
  provider?: string;
  /** Model name (without provider prefix) */
  model?: string;
  /** API key for the LLM provider */
  apiKey?: string;
  /** Show progress */
  verbose: boolean;
  /** Ephemeral focus for this review only */
  prompt?: string;
  /** Ticket context (title, description, acceptance criteria) */
  ticketContext?: string;
  /** Path to config file */
  configPath?: string;
  /** Output file path (writes to file instead of stdout) */
  outputPath?: string;
  
  // Output options
  timezone?: string;
  
  // Section visibility
  mustFix?: boolean;
  shouldFix?: boolean;
  suggestions?: boolean;
  questions?: boolean;
  
  // Section collapse
  collapseMustFix?: string;
  collapseShouldFix?: string;
  collapseSuggestions?: string;
  collapseQuestions?: string;
  
  // Verdict labels
  labelApprove?: string;
  labelChangesNeeded?: string;
  labelHold?: string;
}

export function parseReviewArgs(args: string[]): ReviewArgs {
  const result: ReviewArgs = {
    path: process.cwd(),
    format: 'human',
    jsonExplicit: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json' || arg === '--agent') {
      result.format = 'json';
      result.jsonExplicit = true;
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
    } else if (arg === '--prompt') {
      result.prompt = args[++i];
    } else if (arg === '--ticket-context') {
      result.ticketContext = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.outputPath = args[++i];
    } else if (arg === '--timezone') {
      result.timezone = args[++i];
    } else if (arg === '--must-fix') {
      result.mustFix = args[++i] === 'true';
    } else if (arg === '--should-fix') {
      result.shouldFix = args[++i] === 'true';
    } else if (arg === '--suggestions') {
      result.suggestions = args[++i] === 'true';
    } else if (arg === '--questions') {
      result.questions = args[++i] === 'true';
    } else if (arg === '--collapse-must-fix') {
      result.collapseMustFix = args[++i];
    } else if (arg === '--collapse-should-fix') {
      result.collapseShouldFix = args[++i];
    } else if (arg === '--collapse-suggestions') {
      result.collapseSuggestions = args[++i];
    } else if (arg === '--collapse-questions') {
      result.collapseQuestions = args[++i];
    } else if (arg === '--label-approve') {
      result.labelApprove = args[++i];
    } else if (arg === '--label-changes-needed') {
      result.labelChangesNeeded = args[++i];
    } else if (arg === '--label-hold') {
      result.labelHold = args[++i];
    } else if (!arg.startsWith('-')) {
      result.path = path.resolve(arg);
    }
  }

  // Validate provider/model coupling
  if ((result.provider && !result.model) || (!result.provider && result.model)) {
    console.error('Error: --provider and --model must be provided together');
    process.exit(1);
  }

  // Validate collapse enum values
  const validCollapseValues = ['auto', 'always', 'never'];
  const collapseFields = [
    { name: '--collapse-must-fix', value: result.collapseMustFix },
    { name: '--collapse-should-fix', value: result.collapseShouldFix },
    { name: '--collapse-suggestions', value: result.collapseSuggestions },
    { name: '--collapse-questions', value: result.collapseQuestions },
  ];

  for (const field of collapseFields) {
    if (field.value && !validCollapseValues.includes(field.value)) {
      console.error(`Error: ${field.name} must be one of: ${validCollapseValues.join(', ')}`);
      process.exit(1);
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
// Output Helpers
// ============================================================================

type OutputFormat = 'json' | 'markdown' | 'human';

function getFormatFromExtension(filePath: string): OutputFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'human';
}

function writeOutputToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
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

  // Resolve API key with precedence: CLI > config (with env interpolation) > OPEN_REVIEW_API_KEY env var
  function resolveApiKey(cliKey: string | undefined, configKey: string | undefined): string | undefined {
    if (cliKey) return cliKey;
    if (configKey) {
      const match = configKey.match(/^\$\{(.+)\}$/);
      if (match) {
        return process.env[match[1]];
      }
      return configKey;
    }
    return process.env.OPEN_REVIEW_API_KEY;
  }

  const resolvedApiKey = resolveApiKey(args.apiKey, config.llm.api_key);

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
      ticketContext: args.ticketContext,
    };
    
    if (args.verbose) {
      console.log(`Reviewing ${changes.files.length} changed files against ${args.diff}`);
    }
  } else {
    // Review the whole codebase or let the agent explore
    reviewInput = {
      target: `Explore this codebase and review the code quality. Look for bugs, security issues, and areas for improvement.`,
      ticketContext: args.ticketContext,
    };
    
    if (args.verbose) {
      console.log(`Reviewing codebase at ${args.path}`);
    }
  }

  if (args.verbose) {
    console.log(`Model: ${fullModel}`);
    console.log('');
  }

    // Run the review
  try {
    // Resolve output config with precedence: CLI > config > defaults
    const outputConfig = {
      format: config.output.format,
      colors: config.output.colors,
      timezone: args.timezone ?? config.output.timezone,
      path: config.output.path,
      sections: {
        must_fix: {
          enabled: args.mustFix ?? config.output.sections.must_fix.enabled,
          collapse: (args.collapseMustFix as 'auto' | 'always' | 'never') ?? config.output.sections.must_fix.collapse,
        },
        should_fix: {
          enabled: args.shouldFix ?? config.output.sections.should_fix.enabled,
          collapse: (args.collapseShouldFix as 'auto' | 'always' | 'never') ?? config.output.sections.should_fix.collapse,
        },
        suggestions: {
          enabled: args.suggestions ?? config.output.sections.suggestions.enabled,
          collapse: (args.collapseSuggestions as 'auto' | 'always' | 'never') ?? config.output.sections.suggestions.collapse,
        },
        questions: {
          enabled: args.questions ?? config.output.sections.questions.enabled,
          collapse: (args.collapseQuestions as 'auto' | 'always' | 'never') ?? config.output.sections.questions.collapse,
        },
      },
      verdicts: {
        approve: { label: args.labelApprove ?? config.output.verdicts.approve.label },
        changes_needed: { label: args.labelChangesNeeded ?? config.output.verdicts.changes_needed.label },
        hold: { label: args.labelHold ?? config.output.verdicts.hold.label },
      },
    };

    const result = await runReview(
      {
        basePath: args.path,
        model: fullModel,
        apiKey: resolvedApiKey,
        prompt: args.prompt,
        sections: {
          must_fix: { enabled: outputConfig.sections.must_fix.enabled },
          should_fix: { enabled: outputConfig.sections.should_fix.enabled },
          suggestions: { enabled: outputConfig.sections.suggestions.enabled },
          questions: { enabled: outputConfig.sections.questions.enabled },
        },
        onStep: args.verbose ? (step) => {
          for (const call of step.toolCalls) {
            const argsPreview = JSON.stringify(call.args).slice(0, 60);
            console.log(`  [${step.stepNumber}] ${call.name}(${argsPreview}...)`);
          }
        } : undefined,
        config,
      },
      reviewInput
    );

    // Resolve output path with precedence: CLI > config > stdout
    const outputPath = args.outputPath ?? config.output.path;

    // Determine output format
    let outputFormat: OutputFormat;
    if (args.jsonExplicit) {
      outputFormat = 'json';
    } else if (outputPath) {
      outputFormat = getFormatFromExtension(outputPath);
    } else {
      outputFormat = args.format === 'json' ? 'json' : 'human';
    }

    // Generate output content
    let outputContent: string;
    if (outputFormat === 'json') {
      outputContent = toJSON(result, true, outputConfig);
    } else if (outputFormat === 'markdown') {
      outputContent = renderComment({ result });
    } else {
      outputContent = formatForHuman(result, outputConfig);
    }

    // Write output
    if (outputPath) {
      const resolvedPath = path.resolve(outputPath);
      try {
        writeOutputToFile(resolvedPath, outputContent);
        console.error(`Review results written to ${outputPath}`);
      } catch (error) {
        console.error(`Error writing to ${outputPath}: ${(error as Error).message}`);
        process.exit(1);
      }
    } else {
      console.log(outputContent);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}
