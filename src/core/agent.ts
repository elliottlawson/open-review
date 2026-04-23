/**
 * Core Review Agent - Mastra-based code reviewer
 * 
 * This is the heart of open-review. It uses Mastra's agent framework with
 * filesystem workspace to explore and review code.
 */

import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { z } from 'zod';
import type { ReviewResult, ReviewFinding } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ReviewAgentConfig {
  /** Path to the codebase to review */
  basePath: string;
  /** Model to use (e.g., 'anthropic/claude-sonnet-4-20250514') */
  model: string;
  /** Resolved inline instructions text */
  instructions?: string;
  /** Resolved file content (already read by CLI) */
  instructionsFile?: string;
  /** Ephemeral focus text */
  prompt?: string;
  /** Callback for each step (for progress reporting) */
  onStep?: (step: StepInfo) => void;
}

export interface StepInfo {
  stepNumber: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface ReviewInput {
  /** What to review - can be file paths, a diff description, or general guidance */
  target: string;
  /** Additional context (e.g., PR description, ticket info) */
  context?: string;
  /** Files that changed (helps focus the review) */
  changedFiles?: string[];
  /** The actual diff content */
  diff?: string;
}

// ============================================================================
// Output Schema
// ============================================================================

const FindingSchema = z.object({
  type: z.enum(['issue', 'suggestion', 'praise', 'question']),
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.string().describe('Category like "security", "performance", "error-handling", "style"'),
  title: z.string().describe('Short title for the finding'),
  description: z.string().describe('Detailed explanation'),
  file: z.string().optional().describe('File path if applicable'),
  line: z.number().optional().describe('Line number if applicable'),
  suggestedFix: z.string().optional().describe('Code suggestion if applicable'),
});

const SectionSummariesSchema = z.object({
  mustFix: z.string().optional().describe('1-2 sentence summary of what\'s most important about critical issues'),
  shouldFix: z.string().optional().describe('1-2 sentence summary of what\'s most important about warnings'),
  questions: z.string().optional().describe('1-2 sentence summary of discussion points'),
  suggestions: z.string().optional().describe('1-2 sentence summary of suggestions'),
});

const ReviewResultSchema = z.object({
  summary: z.string().describe('Brief summary of the review'),
  verdict: z.enum(['approve', 'request_changes', 'comment']).describe('Overall recommendation'),
  findings: z.array(FindingSchema).describe('List of findings'),
  sectionSummaries: SectionSummariesSchema.optional().describe('AI-generated summaries for each section header'),
});

// ============================================================================
// Agent Instructions
// ============================================================================

const BASE_INSTRUCTIONS = `You are an expert code reviewer. Your job is to thoroughly review code changes and provide actionable feedback.

## Your Process

1. **Understand the context** - Read any provided PR description, ticket info, or context
2. **Explore the codebase** - Use filesystem tools to understand the project structure and conventions
3. **Review the changes** - Focus on the changed files but read related files for context
4. **Identify issues** - Look for bugs, security issues, performance problems, and code quality issues
5. **Provide feedback** - Be specific, actionable, and constructive

## What to Look For

### Critical (must fix)
- Security vulnerabilities (injection, auth bypass, data exposure)
- Bugs that will cause runtime errors or incorrect behavior
- Data loss or corruption risks

### Warnings (should fix)
- Missing error handling
- Performance issues (N+1 queries, unnecessary computation)
- Missing validation
- Inconsistent patterns with the rest of the codebase

### Suggestions (consider)
- Code clarity improvements
- Better naming
- Refactoring opportunities
- Missing tests

## Guidelines

- Always include file paths and line numbers when referencing code
- For suggestions, provide the actual code fix when possible
- Acknowledge good patterns you see - positive feedback matters
- Don't nitpick style if the codebase doesn't have consistent style
- Focus on what changed, but consider the broader context
- If you're unsure about something, say so rather than guessing

## Section Summaries

After listing your findings, generate brief 1-2 sentence summaries for each section that has findings:
- **mustFix**: What's most critical about these blocking issues (e.g., "Missing strict types and merge conflicts will cause runtime errors")
- **shouldFix**: What's most important about these warnings (e.g., "3 Laravel convention violations in controller methods")
- **questions**: What needs discussion (e.g., "Architecture questions about pagination and relationship loading")
- **suggestions**: What's suggested for improvement (e.g., "2 code organization improvements for better maintainability")

These summaries appear in section headers and should highlight the key themes, not just count issues.`;

// ============================================================================
// Review Agent
// ============================================================================

function buildSystemPrompt(config: ReviewAgentConfig): string {
  const parts: string[] = [BASE_INSTRUCTIONS];

  if (config.prompt) {
    parts.push(`## Review Focus\n\n${config.prompt}`);
  }

  if (config.instructions) {
    parts.push(`## Additional Instructions\n\n${config.instructions}`);
  }

  if (config.instructionsFile) {
    parts.push(`## Project Playbook\n\n${config.instructionsFile}`);
  }

  return parts.join('\n\n');
}

export async function createReviewAgent(config: ReviewAgentConfig) {
  const workspace = new Workspace({
    filesystem: new LocalFilesystem({
      basePath: config.basePath,
      readOnly: true,
    }),
  });

  const instructions = buildSystemPrompt(config);

  const agent = new Agent({
    id: 'open-review-agent',
    name: 'Open Review',
    model: config.model,
    instructions,
    workspace,
    // Note: Memory with observational compression can be added later
    // for handling very large codebases. Requires storage configuration.
  });

  return agent;
}

export async function runReview(
  config: ReviewAgentConfig,
  input: ReviewInput
): Promise<ReviewResult> {
  const agent = await createReviewAgent(config);
  
  // Build the prompt
  let prompt = `Review the following code changes:\n\n`;
  
  if (input.context) {
    prompt += `## Context\n${input.context}\n\n`;
  }
  
  if (input.changedFiles?.length) {
    prompt += `## Changed Files\n${input.changedFiles.map(f => `- ${f}`).join('\n')}\n\n`;
  }
  
  if (input.diff) {
    prompt += `## Diff\n\`\`\`diff\n${input.diff}\n\`\`\`\n\n`;
  }
  
  prompt += `## Task\n${input.target}\n\n`;
  prompt += `Explore the codebase as needed to understand context, then provide your review.`;

  let stepNumber = 0;
  
  const result = await agent.generate(prompt, {
    maxSteps: 100,
    onStepFinish: (event) => {
      stepNumber++;
      if (config.onStep && event.toolCalls?.length) {
        config.onStep({
          stepNumber,
          toolCalls: event.toolCalls.map((call: any) => ({
            name: call.payload?.toolName || call.toolName || 'unknown',
            args: call.payload?.args || call.args || {},
          })),
        });
      }
    },
    structuredOutput: {
      schema: ReviewResultSchema,
    },
  });

  // Extract structured output
  const structured = result.object as z.infer<typeof ReviewResultSchema> | undefined;
  
  if (!structured) {
    // Fallback: parse from text if structured output failed
    return {
      summary: result.text || 'Review completed',
      recommendation: 'comment',
      findings: [],
      tokensUsed: result.usage?.totalTokens || 0,
    };
  }

  // Map to our types
  const findings: ReviewFinding[] = structured.findings.map((f, i) => ({
    id: `finding-${i}`,
    type: f.type,
    severity: f.severity,
    category: f.category,
    title: f.title,
    description: f.description,
    file: f.file,
    line: f.line,
    suggestedFix: f.suggestedFix,
  }));

  return {
    summary: structured.summary,
    recommendation: structured.verdict,
    findings,
    tokensUsed: result.usage?.totalTokens || 0,
    sectionSummaries: structured.sectionSummaries,
  };
}
