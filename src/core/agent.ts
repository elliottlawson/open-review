/**
 * Core Review Agent - Mastra-based code reviewer
 *
 * This is the heart of open-review. It uses Mastra's agent framework with
 * filesystem workspace to explore and review code.
 */

import { Agent } from '@mastra/core/agent';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { z } from 'zod';
import type { ReviewResult, ReviewFinding, SectionConfig } from './types.js';
import { ReviewResultSchema } from './schema.js';
import { buildSystemPrompt } from './prompts/index.js';
import { validateDiscipline } from './discipline.js';

// ============================================================================
// Configuration
// ============================================================================

export interface SectionVisibilityConfig {
  must_fix: { enabled: boolean };
  should_fix: { enabled: boolean };
  suggestions: { enabled: boolean };
  questions: { enabled: boolean };
}

export interface ReviewAgentConfig {
  /** Path to the codebase to review */
  basePath: string;
  /** Model to use (e.g., 'anthropic/claude-sonnet-4-20250514') */
  model: string;
  /** API key for the LLM provider */
  apiKey?: string;
  /** Resolved inline instructions text */
  instructions?: string;
  /** Resolved file content (already read by CLI) */
  instructionsFile?: string;
  /** Ephemeral focus text */
  prompt?: string;
  /** Section visibility configuration */
  sections?: SectionVisibilityConfig;
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
  /** Ticket context: title, description, acceptance criteria. Passed explicitly; not auto-fetched. */
  ticketContext?: string;
  /** Files that changed (helps focus the review) */
  changedFiles?: string[];
  /** The actual diff content */
  diff?: string;
}

// ============================================================================
// Review Agent
// ============================================================================

export async function createReviewAgent(config: ReviewAgentConfig) {
  const workspace = new Workspace({
    filesystem: new LocalFilesystem({
      basePath: config.basePath,
      readOnly: true,
    }),
  });

  const instructions = buildSystemPrompt({
    instructions: config.instructions,
    instructionsFile: config.instructionsFile,
    sections: config.sections,
    prompt: config.prompt,
  });

  const agent = new Agent({
    id: 'open-review-agent',
    name: 'Open Review',
    model: {
      id: config.model as `${string}/${string}`,
      apiKey: config.apiKey,
    },
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

  // Build the user prompt
  let prompt = `Review the following code changes:\n\n`;

  if (input.context) {
    prompt += `## Context\n${input.context}\n\n`;
  }

  if (input.ticketContext) {
    prompt += `## Ticket Context\n${input.ticketContext}\n\n`;
  }

  if (input.changedFiles?.length) {
    prompt += `## Changed Files\n${input.changedFiles.map((f) => `- ${f}`).join('\n')}\n\n`;
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
      recommendation: 'hold',
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

  const reviewResult: ReviewResult = {
    summary: structured.summary,
    recommendation: structured.verdict,
    findings,
    tokensUsed: result.usage?.totalTokens || 0,
    sectionSummaries: structured.sectionSummaries,
  };

  // Run discipline validator
  const discipline = validateDiscipline(reviewResult);
  if (discipline.warnings.length > 0) {
    reviewResult.disciplineWarnings = discipline.warnings;
  }

  return reviewResult;
}
