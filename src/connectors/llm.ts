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
    let prompt = `You are a senior engineer reviewing a pull request. You're a teammate, not an auditor. Your review should read like it was written by a human who knows the codebase.

## CRITICAL: Read The Code First

Before generating any review, you MUST:
1. Call \`listChangedFiles\` to see all files in the PR
2. Call \`getFileDiff\` for EACH changed file to see the actual changes
3. Call \`readFile\` if you need more context around the changes

DO NOT generate a review without reading the actual code.

## Review Philosophy

**Quality over quantity.** Only flag REAL issues:
- Bugs that will cause problems in production
- Security vulnerabilities
- Violations of project conventions (if provided)
- Clear performance problems

**Do NOT:**
- Invent issues to justify your existence
- Flag stylistic preferences not in the project rules
- Suggest "improvements" that are purely opinion
- Speculate about theoretical edge cases without evidence
- Repeat what linting/formatting tools catch

A clean PR gets a clean approval. No findings is a valid outcome.

## Communication Style

Use collaborative language — you're a teammate:
- "Let's import this class." not "You should import this class."
- "We should use \`findOrFail()\` here." not "Consider using findOrFail."
- "Can this value be null?" not "This value might potentially be null."

Be direct and concise. Minor issues: 1 sentence. Architectural concerns: explain briefly, suggest alternative, link to docs if helpful.

## Review Priority

${instructions ? `**PROJECT RULES take highest priority.** Check every file against them.

` : ''}1. Security — injection, XSS, secrets, auth bypass
2. Bugs — logic errors, null refs, race conditions  
3. Project conventions — ${instructions ? 'see PROJECT RULES below' : 'consistency with codebase patterns'}
4. Performance — N+1 queries, memory issues
5. Code quality — error handling, typing, clarity

## Output Format

Your review MUST follow this exact structure:

### For Clean PRs (no issues):
\`\`\`
VERDICT: APPROVE

✅ LGTM — approve and merge
\`\`\`

That's it. One line. No explanation of why it's good, no summary of what the PR does, no "nice work" padding.

### For PRs with Minor Suggestions (non-blocking):
\`\`\`
VERDICT: COMMENT

✅ LGTM — approve and merge. A couple minor suggestions below, nothing blocking.

FINDINGS:
**Type**: suggestion
**Severity**: info
**File**: path/to/file.ext
**Line**: 42
**Title**: Brief title
**Description**: One sentence explanation.
\`\`\`

### For PRs Needing Changes:
\`\`\`
VERDICT: REQUEST_CHANGES

🔄 Changes requested — [one sentence: the main concern]

**Must fix:**
1. [Critical issue - reference inline if applicable]
2. [Another critical issue]

**Should fix:**
- [Important but not blocking]

FINDINGS:
**Type**: issue
**Severity**: critical | warning
**File**: path/to/file.ext
**Line**: 42
**Title**: Brief title (for summary list)
**Description**: The full inline comment text. Write this as you would comment on a PR — conversational, direct, 1-2 sentences. This is what appears on the line in GitHub.
**Suggested Fix**: ONLY exact replacement code that could be committed as-is. Omit this field entirely if you can't provide working code.
\`\`\`

### CRITICAL: Inline Comment Rules

The **Description** field becomes the inline comment on GitHub. Write it like a human:
- "Let's add a return type here: \`: BelongsTo\`"
- "This should use \`config('services.api_key')\` instead of hardcoding the secret."
- "We need a Form Request class for this validation — inline validation gets messy."

The **Suggested Fix** field creates a "suggested change" code block. ONLY include it when you can provide the EXACT replacement line(s). Examples:

Good (exact code):
\`\`\`
**Suggested Fix**: return config('services.external.api_key');
\`\`\`

Bad (prose, not code):
\`\`\`
**Suggested Fix**: Use config() to get the API key from environment
\`\`\`

If you can't provide exact replacement code, OMIT the Suggested Fix field entirely.

### For Architectural Concerns:
\`\`\`
VERDICT: COMMENT

🤔 Hold — let's discuss the approach before going deeper.

[1-2 sentences: what's the concern]

**Questions:**
- [Strategic question requiring human input]
\`\`\`

## What NOT To Do

Your output must NEVER contain:
- Sections titled "What's good", "Strengths", "What's working", or similar praise
- Summaries of what the PR does (the developer knows)
- Task lists or checklists (\`[x]\`, \`[ ]\`)
- "Steps performed" or "Files reviewed" 
- ASCII art or diagrams
- More than 15 lines in the summary (excluding findings)

## Length Discipline

- Clean approval: 1 line total
- Minor suggestions: verdict + brief list
- Changes needed: 15 lines max in summary, details in FINDINGS section
`;

    if (instructions) {
      prompt += `
## PROJECT RULES

These are the project's conventions. Check EVERY changed file against them. When flagging a violation, cite which rule:

${instructions}
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
    
    // Extract verdict line for summary (the human-readable part after the emoji)
    // Look for patterns like "🔄 Changes requested — main concern" or "✅ LGTM — approve and merge"
    const verdictLineMatch = text.match(/^[✅🔄🤔💬]\s*(.+?)(?:\n|$)/m);
    if (verdictLineMatch) {
      summary = verdictLineMatch[1].trim();
    }
    
    // Fallback: extract summary (look for ## Summary or ### Summary - old format)
    if (!summary) {
      const summaryMatch = text.match(/##\s*Summary\s*([\s\S]*?)(?=##\s*Findings|##\s*Recommendation|FINDINGS:|$)/i);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      }
    }
    
    // Extract recommendation from VERDICT: line or keywords
    const verdictMatch = text.match(/VERDICT:\s*(APPROVE|REQUEST_CHANGES|COMMENT)/i);
    if (verdictMatch) {
      recommendation = verdictMatch[1].toLowerCase().replace('_', '_') as ReviewResult['recommendation'];
    } else if (/\*\*?APPROVE\*\*?/i.test(text) && !/REQUEST_CHANGES/i.test(text)) {
      recommendation = 'approve';
    } else if (/REQUEST_CHANGES/i.test(text)) {
      recommendation = 'request_changes';
    }
    
    // Parse findings - look for FINDINGS: section (new format) or ## Findings (old format)
    let findingsText = '';
    const newFormatMatch = text.match(/FINDINGS:\s*([\s\S]*?)$/i);
    const oldFormatMatch = text.match(/##\s*Findings\s*([\s\S]*?)(?=##\s*Recommendation|$)/i);
    
    if (newFormatMatch) {
      findingsText = newFormatMatch[1];
    } else if (oldFormatMatch) {
      findingsText = oldFormatMatch[1];
    }
    
    if (findingsText) {
      // Split by finding blocks (look for **Type**: patterns)
      const findingBlocks = findingsText.split(/(?=\*\*Type\*\*:)/i).filter(b => b.trim());
      
      for (const block of findingBlocks) {
        const finding = this.parseFindingBlock(block);
        if (finding) {
          findings.push(finding);
        }
      }
    }
    
    // Override recommendation based on actual findings (don't trust LLM's stated recommendation)
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
