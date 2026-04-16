/**
 * LLM Connector
 * 
 * Handles multi-provider LLM interactions using Vercel AI SDK:
 * - Supports Anthropic, OpenAI, and OpenRouter
 * - Provides tools for codebase exploration
 * - Generates structured review results
 */

import { generateText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type {
  LLMConfig,
  PRContext,
  LinearContext,
  ReviewResult,
  ReviewFinding,
} from '../core/types.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds between retries

// ============================================================================
// Types
// ============================================================================

type Provider = 'anthropic' | 'openai' | 'openrouter';

interface ReviewInput {
  prContext: PRContext;
  linearContext?: LinearContext;
  instructions?: string;  // Combined file + inline instructions
  getFileContent: (path: string) => Promise<string>;
}

// ============================================================================
// LLM Connector Class
// ============================================================================

export class LLMConnector {
  private provider: Provider;
  private model: string;
  private maxSteps: number;
  
  constructor(config: LLMConfig, maxSteps: number = 15) {
    this.provider = config.provider;
    this.model = config.model;
    this.maxSteps = maxSteps;
  }
  
  // ==========================================================================
  // Model Selection
  // ==========================================================================
  
  private getModel() {
    switch (this.provider) {
      case 'anthropic':
        return anthropic(this.model);
      case 'openai':
        return openai(this.model);
      case 'openrouter':
        // OpenRouter uses OpenAI-compatible API with custom provider
        // For now, fall back to standard OpenAI - OpenRouter setup would need custom provider
        return openai(this.model);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }
  
  // ==========================================================================
  // Review Generation
  // ==========================================================================
  
  async generateReview(input: ReviewInput): Promise<ReviewResult> {
    const { prContext, linearContext, instructions, getFileContent } = input;
    
    // Build tools for the agent
    const tools = this.buildTools(prContext, getFileContent);
    
    // Build the system prompt
    const systemPrompt = this.buildSystemPrompt(instructions);
    
    // Build the user prompt with PR context
    const userPrompt = this.buildUserPrompt(prContext, linearContext);
    
    // Generate the review with retry logic for transient errors
    let result;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await generateText({
          model: this.getModel(),
          system: systemPrompt,
          prompt: userPrompt,
          tools,
          stopWhen: stepCountIs(this.maxSteps),
        });
        break; // Success, exit retry loop
      } catch (error) {
        const err = error as Error;
        lastError = err;
        
        // Check if this is a retryable error
        const isRateLimit = err.message.includes('rate') || err.message.includes('429');
        const isTimeout = err.message.includes('timeout') || err.message.includes('ETIMEDOUT');
        const isOverloaded = err.message.includes('overloaded') || err.message.includes('503');
        
        if ((isRateLimit || isTimeout || isOverloaded) && attempt < MAX_RETRIES) {
          const waitTime = RETRY_DELAY_MS * attempt; // Exponential backoff
          console.log(`   ⚠️ ${isRateLimit ? 'Rate limited' : isTimeout ? 'Timeout' : 'Service overloaded'}, retrying in ${waitTime / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Non-retryable or max retries reached - provide clear error messages
        if (isRateLimit) {
          throw new Error(`Rate limited by ${this.provider} after ${attempt} attempts. Please wait and try again.`);
        }
        if (isTimeout) {
          throw new Error(`Request to ${this.provider} timed out after ${attempt} attempts. The PR may be too large.`);
        }
        if (err.message.includes('401') || err.message.includes('unauthorized') || err.message.includes('invalid_api_key')) {
          throw new Error(`Authentication failed with ${this.provider}. Check your API key.`);
        }
        if (err.message.includes('insufficient') || err.message.includes('quota')) {
          throw new Error(`Insufficient quota/credits with ${this.provider}. Check your account.`);
        }
        // Re-throw with provider context
        throw new Error(`LLM error (${this.provider}): ${err.message}`);
      }
    }
    
    if (!result) {
      throw lastError || new Error('Unknown error generating review');
    }
    
    // Debug: log raw response (uncomment for debugging)
    // console.log('DEBUG RAW LLM RESPONSE:\n', result.text);
    
    // Parse the review result
    return this.parseReviewResult(result.text, result.usage?.totalTokens || 0);
  }
  
  // ==========================================================================
  // Tool Building
  // ==========================================================================
  
  private buildTools(prContext: PRContext, getFileContent: (path: string) => Promise<string>) {
    return {
      readFile: tool({
        description: 'Read the full contents of a file in the repository. Use this to understand the context around changes.',
        inputSchema: z.object({
          path: z.string().describe('Path to the file relative to repository root'),
        }),
        execute: async ({ path }) => {
          try {
            const content = await getFileContent(path);
            return { success: true, content };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        },
      }),
      
      getFileDiff: tool({
        description: 'Get the diff/patch for a specific file in this PR',
        inputSchema: z.object({
          path: z.string().describe('Path to the file'),
        }),
        execute: async ({ path }) => {
          const file = prContext.files.find(f => f.path === path);
          if (!file) {
            return { success: false, error: `File ${path} not found in PR` };
          }
          return { 
            success: true, 
            path: file.path,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch || 'No patch available',
          };
        },
      }),
      
      listChangedFiles: tool({
        description: 'List all files changed in this PR with their status',
        inputSchema: z.object({}),
        execute: async () => {
          return {
            success: true,
            files: prContext.files.map(f => ({
              path: f.path,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
            })),
          };
        },
      }),
      
      getPRInfo: tool({
        description: 'Get metadata about the PR (title, description, author)',
        inputSchema: z.object({}),
        execute: async () => {
          return {
            success: true,
            title: prContext.title,
            body: prContext.body,
            author: prContext.author,
            baseBranch: prContext.baseBranch,
            totalAdditions: prContext.files.reduce((sum, f) => sum + f.additions, 0),
            totalDeletions: prContext.files.reduce((sum, f) => sum + f.deletions, 0),
            fileCount: prContext.files.length,
          };
        },
      }),
    };
  }
  
  // ==========================================================================
  // Prompt Building
  // ==========================================================================
  
  private buildSystemPrompt(instructions?: string): string {
    let prompt = `You are an expert code reviewer. Your job is to review pull requests thoroughly and provide actionable feedback.

## CRITICAL: You MUST Read The Code

Before generating any findings, you MUST:
1. Call \`listChangedFiles\` to see all files in the PR
2. Call \`getFileDiff\` for EACH changed file to see the actual code changes
3. If the diff is insufficient, call \`readFile\` to see full context

DO NOT generate a review without reading the actual code.

## IMPORTANT: Quality Over Quantity

Only report REAL issues that would cause problems or violate the PROJECT RULES. Do NOT:
- Invent issues just to have something to say
- Flag stylistic preferences that aren't in the PROJECT RULES
- Suggest "improvements" that are purely opinion-based
- Flag "potential" edge cases unless they're clearly bugs

If the code is clean and follows the rules, say so! A review with 0 findings is perfectly valid when the code is well-written.

## Review Priority

${instructions ? `### PROJECT RULES (HIGHEST PRIORITY)
The project has defined specific conventions. Violations of these rules are the PRIMARY focus of your review. The rules are provided below - read them carefully and check every changed file against them.

` : ''}1. **Security issues** - SQL injection, XSS, hardcoded secrets, auth bypass
2. **Bugs** - Logic errors, null reference risks, race conditions
3. **Project convention violations** - ${instructions ? 'See PROJECT RULES below' : 'Check for inconsistent patterns'}
4. **Performance** - N+1 queries, memory leaks, inefficient algorithms
5. **Code quality** - Missing error handling, poor typing, unclear logic

## Output Format

### Summary
1-3 sentences about what the PR does and your overall assessment.

### Findings
List EACH finding in this exact format:

**Type**: issue | suggestion | question
**Severity**: critical | warning | info
**Category**: security | performance | bug | style | architecture | testing | documentation
**File**: path/to/file.ext
**Line**: line number
**Title**: Short description (under 10 words)
**Description**: Detailed explanation of the issue and why it matters.
**Suggested Fix**: Concrete code suggestion if applicable.

### Recommendation
- **APPROVE** - No critical or warning issues, code is ready to merge
- **REQUEST_CHANGES** - Has critical or warning issues that must be addressed
- **COMMENT** - Only minor suggestions, can merge at author's discretion
`;

    if (instructions) {
      prompt += `
## PROJECT RULES

The following rules/instructions are defined by this project. Check EVERY changed file against these rules:

${instructions}

When you find a violation, cite which rule it violates.
`;
    }

    return prompt;
  }
  
  private buildUserPrompt(prContext: PRContext, linearContext?: LinearContext): string {
    let prompt = `# Pull Request Review Request

## PR Information
- **Title**: ${prContext.title}
- **Author**: ${prContext.author}
- **Base Branch**: ${prContext.baseBranch}
- **Files Changed**: ${prContext.files.length}
- **Total Changes**: +${prContext.files.reduce((s, f) => s + f.additions, 0)} / -${prContext.files.reduce((s, f) => s + f.deletions, 0)}

## PR Description
${prContext.body || '_No description provided_'}

## Changed Files
${prContext.files.map(f => `- ${f.status}: \`${f.path}\` (+${f.additions}/-${f.deletions})`).join('\n')}
`;

    if (linearContext && linearContext.issues.length > 0) {
      prompt += `\n## Related Linear Issues\n`;
      for (const issue of linearContext.issues) {
        prompt += `### ${issue.identifier}: ${issue.title}\n`;
        prompt += `State: ${issue.state} | Priority: ${['None', 'Urgent', 'High', 'Medium', 'Low'][issue.priority] || 'Unknown'}\n`;
        if (issue.description) {
          const desc = issue.description.length > 300 ? issue.description.substring(0, 300) + '...' : issue.description;
          prompt += `Description: ${desc}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += `
## REQUIRED STEPS

You must follow these steps IN ORDER:

1. **First**: Call \`listChangedFiles\` to see all changed files
2. **Second**: For EACH file, call \`getFileDiff\` to see the actual changes
3. **Third**: If you need more context, call \`readFile\` for the full file
4. **Finally**: Generate your review with specific findings

DO NOT skip directly to generating a review. You must examine the code first.

Begin by listing the changed files.`;

    return prompt;
  }
  
  // ==========================================================================
  // Result Parsing
  // ==========================================================================
  
  private parseReviewResult(text: string, tokensUsed: number): ReviewResult {
    const findings: ReviewFinding[] = [];
    let summary = '';
    let recommendation: ReviewResult['recommendation'] = 'comment';
    
    // Extract summary (look for ## Summary or ### Summary)
    const summaryMatch = text.match(/##\s*Summary\s*([\s\S]*?)(?=##\s*Findings|##\s*Recommendation|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }
    
    // Extract recommendation
    if (/\*\*?APPROVE\*\*?/i.test(text) && !/REQUEST_CHANGES/i.test(text)) {
      recommendation = 'approve';
    } else if (/REQUEST_CHANGES/i.test(text)) {
      recommendation = 'request_changes';
    }
    
    // Parse findings - look for the structured format (## Findings or ### Findings)
    const findingsSection = text.match(/##\s*Findings\s*([\s\S]*?)(?=##\s*Recommendation|$)/i);
    if (findingsSection) {
      // Split by finding blocks (look for **Type**: patterns)
      const findingBlocks = findingsSection[1].split(/(?=\*\*Type\*\*:)/i).filter(b => b.trim());
      
      for (const block of findingBlocks) {
        const finding = this.parseFindingBlock(block);
        if (finding) {
          findings.push(finding);
        }
      }
    }
    
    // Override recommendation based on actual findings (don't trust LLM's recommendation)
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    
    if (criticalCount > 0 || warningCount > 0) {
      recommendation = 'request_changes';
    } else if (findings.length > 0) {
      // Only info-level findings
      recommendation = 'comment';
    } else {
      // No findings at all
      recommendation = 'approve';
    }
    
    return {
      summary,
      findings,
      recommendation,
      tokensUsed,
    };
  }
  
  private parseFindingBlock(block: string): ReviewFinding | null {
    const typeMatch = block.match(/\*\*Type\*\*:\s*(\w+)/i);
    const severityMatch = block.match(/\*\*Severity\*\*:\s*(\w+)/i);
    const categoryMatch = block.match(/\*\*Category\*\*:\s*(\w+)/i);
    const fileMatch = block.match(/\*\*File\*\*:\s*([^\n*]+)/i);
    const lineMatch = block.match(/\*\*Line\*\*:\s*(\d+)/i);
    const titleMatch = block.match(/\*\*Title\*\*:\s*([^\n]+)/i);
    const descMatch = block.match(/\*\*Description\*\*:\s*([\s\S]*?)(?=\*\*Suggested Fix\*\*|$)/i);
    const fixMatch = block.match(/\*\*Suggested Fix\*\*:\s*([\s\S]*?)$/i);
    
    if (!typeMatch || !titleMatch) {
      return null;
    }
    
    const type = typeMatch[1].toLowerCase() as ReviewFinding['type'];
    if (!['issue', 'suggestion', 'praise', 'question'].includes(type)) {
      return null;
    }
    
    return {
      id: `finding-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      severity: (severityMatch?.[1]?.toLowerCase() || 'info') as ReviewFinding['severity'],
      category: categoryMatch?.[1]?.toLowerCase() || 'general',
      title: titleMatch[1].trim(),
      description: descMatch?.[1]?.trim() || '',
      file: fileMatch?.[1]?.trim().replace(/`/g, ''),
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      suggestedFix: fixMatch?.[1]?.trim(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLLMConnector(config: LLMConfig): LLMConnector {
  return new LLMConnector(config);
}
