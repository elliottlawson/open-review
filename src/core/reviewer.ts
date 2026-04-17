/**
 * Review Orchestrator
 * 
 * Coordinates the full review workflow:
 * 1. Fetch PR context from GitHub
 * 2. Fetch related issues from Linear (optional)
 * 3. Generate review using LLM
 * 4. Post/update comments on GitHub
 */

import { GitHubConnector } from '../connectors/github.js';
import { LinearConnector } from '../connectors/linear.js';
import { LLMConnector } from '../connectors/llm.js';
import type {
  OpenReviewConfig,
  PRContext,
  LinearContext,
  ReviewResult,
} from './types.js';

// Fallback convention file names to look for (in order of priority)
// Used when no instructions_file is specified
const CONVENTION_FILES = [
  'CONVENTIONS.md',
  'CLAUDE.md', 
  '.github/CONVENTIONS.md',
  'docs/conventions.md',
  'docs/CONVENTIONS.md',
  '.open-review/instructions.md',
];

// Hardcoded behavior settings (always on)
const AUTO_RESOLVE = true;      // Delete comments when issues are fixed
const UPDATE_IN_PLACE = true;   // Update existing comments vs create new
const SHOW_PROGRESS = true;     // Show "Reviewing..." indicator
const MAX_STEPS = 15;           // Max tool calls per review

// ============================================================================
// Types
// ============================================================================

export interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface ReviewOutput {
  reviewId: string;
  prContext: PRContext;
  linearContext?: LinearContext;
  result: ReviewResult;
  commentId?: number;
  postedFindings: number;
  formattedComment: string;
}

// ============================================================================
// Reviewer Class
// ============================================================================

export class Reviewer {
  private github: GitHubConnector;
  private linear: LinearConnector | null;
  private llm: LLMConnector;
  private config: OpenReviewConfig;
  
  constructor(config: OpenReviewConfig) {
    this.config = config;
    this.github = new GitHubConnector(config.github.token);
    this.linear = config.linear ? new LinearConnector(config.linear.apiKey) : null;
    this.llm = new LLMConnector(config.llm, MAX_STEPS);
  }
  
  // ==========================================================================
  // Main Review Flow
  // ==========================================================================
  
  async review(options: ReviewOptions): Promise<ReviewOutput> {
    const { owner, repo, prNumber, dryRun = false, verbose = false } = options;
    const reviewId = this.generateReviewId();
    
    // Step 1: Fetch PR context
    if (verbose) console.log('📥 Fetching PR context...');
    const prContext = await this.github.getPRContext(owner, repo, prNumber);
    
    if (verbose) {
      console.log(`   Title: ${prContext.title}`);
      console.log(`   Files: ${prContext.files.length}`);
      console.log(`   Changes: +${prContext.files.reduce((s, f) => s + f.additions, 0)} / -${prContext.files.reduce((s, f) => s + f.deletions, 0)}`);
    }
    
    // Step 2: Fetch Linear context (if configured)
    let linearContext: LinearContext | undefined;
    if (this.linear) {
      if (verbose) console.log('🔗 Searching for related Linear issues...');
      linearContext = await this.linear.findRelatedIssues(prContext.title, prContext.body);
      
      if (verbose && linearContext.issues.length > 0) {
        console.log(`   Found ${linearContext.issues.length} related issues:`);
        for (const issue of linearContext.issues) {
          console.log(`   - ${issue.identifier}: ${issue.title}`);
        }
      } else if (verbose) {
        console.log('   No related issues found');
      }
    }
    
    // Step 3: Load instructions (from file and/or inline config)
    if (verbose) console.log('📜 Loading review instructions...');
    const instructions = await this.loadInstructions(owner, repo, prContext.headSha, verbose);
    
    // Step 4: Post progress indicator (if not dry run)
    let progressCommentId: number | undefined;
    if (!dryRun && this.config.review.postComments && SHOW_PROGRESS) {
      if (verbose) console.log('⏳ Posting progress indicator...');
      try {
        progressCommentId = await this.github.postProgressComment(owner, repo, prNumber);
      } catch (error) {
        // Non-fatal: continue without progress indicator
        if (verbose) console.log(`   Could not post progress indicator: ${(error as Error).message}`);
      }
    }
    
    // Step 5: Generate review using LLM
    if (verbose) console.log('🤖 Generating review...');
    
    let result;
    try {
      result = await this.llm.generateReview({
        prContext,
        linearContext,
        instructions,
        getFileContent: async (path: string) => {
          return this.github.getFileContent(owner, repo, path, prContext.headSha);
        },
      });
    } catch (error) {
      // Clean up progress indicator on failure
      if (progressCommentId) {
        try {
          await this.github.deleteComment(owner, repo, progressCommentId);
        } catch { /* ignore cleanup errors */ }
      }
      throw error; // Re-throw the original error
    }
    
    // Clean up progress indicator on success
    if (progressCommentId) {
      try {
        await this.github.deleteComment(owner, repo, progressCommentId);
      } catch (error) {
        if (verbose) console.log(`   Could not delete progress indicator: ${(error as Error).message}`);
      }
    }
    
    // Add finding for empty PR description (if enabled)
    if (this.config.review.flagEmptyDescription !== false) {
      const hasDescription = prContext.body && prContext.body.trim().length > 0;
      if (!hasDescription) {
        result.findings.push({
          id: `finding-empty-description-${Date.now().toString(36)}`,
          type: 'issue',
          severity: 'info',
          category: 'documentation',
          title: 'PR has no description',
          description: 'Consider adding a description to explain what this PR does and why. This helps reviewers understand the context and makes the PR history more useful.',
        });
        // Recalculate recommendation if this is the only finding
        if (result.findings.length === 1) {
          result.recommendation = 'comment';
        }
      }
    }
    
    if (verbose) {
      console.log(`   Findings: ${result.findings.length}`);
      console.log(`   Recommendation: ${result.recommendation}`);
      console.log(`   Tokens used: ${result.tokensUsed}`);
    }
    
    // Step 6: Post comments (unless dry run)
    let commentId: number | undefined;
    let postedFindings = 0;
    
    if (!dryRun && this.config.review.postComments) {
      if (verbose) console.log('💬 Posting review...');
      
      // Post summary comment
      const summaryBody = this.formatSummaryComment(result, linearContext);
      commentId = await this.github.postSummaryComment(
        owner,
        repo,
        prNumber,
        prContext.headSha,
        summaryBody,
        reviewId
      );
      
      if (verbose) console.log(`   Posted summary comment #${commentId}`);
      
      // Reconcile inline comments with existing ones
      const inlineFindings = result.findings.filter(f => f.file && f.line && f.type === 'issue');
      
      // Resolve stale comments (issues that are now fixed)
      if (AUTO_RESOLVE) {
        const resolved = await this.github.resolveStaleInlineComments(
          owner,
          repo,
          prContext.existingComments,
          inlineFindings,
          verbose
        );
        if (resolved > 0 && verbose) {
          console.log(`   Resolved ${resolved} stale inline comments`);
        }
      }
      
      // Post/update inline comments for current findings
      let createdCount = 0;
      let updatedCount = 0;
      let movedCount = 0;
      
      for (const finding of inlineFindings) {
        const result = await this.github.postInlineComment(
          owner,
          repo,
          prNumber,
          prContext.headSha,
          finding,
          reviewId,
          prContext.existingComments
        );
        
        if (result.action === 'created') {
          createdCount++;
          if (verbose) console.log(`   Created inline comment on ${finding.file}:${finding.line}`);
        } else if (result.action === 'updated') {
          updatedCount++;
          if (verbose) console.log(`   Updated inline comment on ${finding.file}:${finding.line}`);
        } else if (result.action === 'moved') {
          movedCount++;
          if (verbose) console.log(`   Moved inline comment to ${finding.file}:${finding.line}`);
        }
      }
      
      postedFindings = createdCount + updatedCount + movedCount;
      if (verbose && (updatedCount > 0 || movedCount > 0)) {
        console.log(`   (${createdCount} new, ${updatedCount} updated, ${movedCount} moved)`);
      }
    } else if (dryRun && verbose) {
      console.log('🔍 Dry run - not posting comments');
    }
    
    // Always generate formatted comment for dry run preview
    const formattedComment = this.formatSummaryComment(result, linearContext);
    
    return {
      reviewId,
      prContext,
      linearContext,
      result,
      commentId,
      postedFindings,
      formattedComment,
    };
  }
  
  // ==========================================================================
  // Formatting
  // ==========================================================================
  
  private formatSummaryComment(result: ReviewResult, linearContext?: LinearContext): string {
    const lines: string[] = [];
    
    // Separate findings by severity
    const mustFix = result.findings.filter(f => f.severity === 'critical');
    const shouldFix = result.findings.filter(f => f.severity === 'warning');
    const suggestions = result.findings.filter(f => f.severity === 'info' && f.type === 'suggestion');
    const questions = result.findings.filter(f => f.type === 'question');
    const infoItems = result.findings.filter(f => f.severity === 'info' && f.type !== 'suggestion' && f.type !== 'question');
    
    // Clean approval — one line, nothing else
    if (result.recommendation === 'approve' && result.findings.length === 0) {
      return '✅ LGTM — approve and merge';
    }
    
    // Approval with minor suggestions
    if (result.recommendation === 'approve' || 
        (result.recommendation === 'comment' && mustFix.length === 0 && shouldFix.length === 0)) {
      lines.push('✅ LGTM — approve and merge. A couple minor suggestions below, nothing blocking.');
      lines.push('');
      
      // Non-blocking items in collapsible
      const nonBlocking = [...suggestions, ...infoItems, ...questions];
      if (nonBlocking.length > 0) {
        for (const finding of nonBlocking) {
          const location = finding.file ? ` (\`${finding.file}${finding.line ? `:${finding.line}` : ''}\`)` : '';
          lines.push(`- ${finding.title}${location}`);
        }
      }
      
      return lines.join('\n');
    }
    
    // Changes requested
    if (result.recommendation === 'request_changes' || mustFix.length > 0 || shouldFix.length > 0) {
      // Verdict line with main concern
      const mainConcern = mustFix[0]?.title || shouldFix[0]?.title || 'issues found that need attention';
      lines.push(`🔄 Changes requested — ${mainConcern.toLowerCase()}`);
      lines.push('');
      
      // Must fix section
      if (mustFix.length > 0) {
        lines.push('**Must fix:**');
        for (let i = 0; i < mustFix.length; i++) {
          const f = mustFix[i];
          const location = f.file ? ` (\`${f.file}${f.line ? `:${f.line}` : ''}\`)` : '';
          lines.push(`${i + 1}. ${f.title}${location}`);
        }
        lines.push('');
      }
      
      // Should fix section  
      if (shouldFix.length > 0) {
        lines.push('**Should fix:**');
        for (const f of shouldFix) {
          const location = f.file ? ` (\`${f.file}${f.line ? `:${f.line}` : ''}\`)` : '';
          lines.push(`- ${f.title}${location}`);
        }
        lines.push('');
      }
      
      // Non-blocking suggestions in collapsible
      const nonBlocking = [...suggestions, ...infoItems];
      if (nonBlocking.length > 0) {
        lines.push('<details>');
        lines.push('<summary>Suggestions (non-blocking)</summary>');
        lines.push('');
        for (const f of nonBlocking) {
          const location = f.file ? ` (\`${f.file}${f.line ? `:${f.line}` : ''}\`)` : '';
          lines.push(`- ${f.title}${location}`);
        }
        lines.push('</details>');
      }
      
      return lines.join('\n');
    }
    
    // Architectural/approach concern (questions without blocking issues)
    if (questions.length > 0 && mustFix.length === 0 && shouldFix.length === 0) {
      lines.push(`🤔 Hold — let's discuss the approach before going deeper on the code.`);
      lines.push('');
      
      if (result.summary) {
        lines.push(result.summary);
        lines.push('');
      }
      
      lines.push('**Questions:**');
      for (const q of questions) {
        lines.push(`- ${q.title}`);
      }
      
      return lines.join('\n');
    }
    
    // Fallback: comment with info items
    lines.push('💬 Left some feedback for consideration.');
    lines.push('');
    
    for (const finding of result.findings) {
      const location = finding.file ? ` (\`${finding.file}${finding.line ? `:${finding.line}` : ''}\`)` : '';
      lines.push(`- ${finding.title}${location}`);
    }
    
    return lines.join('\n');
  }
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  private generateReviewId(): string {
    return `review-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }
  
  /**
   * Load instructions from file and/or inline config.
   * Priority:
   * 1. Explicit instructions_file from config
   * 2. Auto-detect from common convention file locations
   * 3. Inline instructions from config (appended to file content if both exist)
   */
  private async loadInstructions(
    owner: string, 
    repo: string, 
    sha: string, 
    verbose: boolean
  ): Promise<string | undefined> {
    let fileContent: string | undefined;
    
    // Try explicit instructions_file first
    if (this.config.review.instructionsFile) {
      try {
        fileContent = await this.github.getFileContent(
          owner, repo, this.config.review.instructionsFile, sha
        );
        if (verbose) console.log(`   Loaded: ${this.config.review.instructionsFile}`);
      } catch {
        if (verbose) console.log(`   Warning: Could not load ${this.config.review.instructionsFile}`);
      }
    }
    
    // Fall back to auto-detection if no explicit file
    if (!fileContent && !this.config.review.instructionsFile) {
      for (const file of CONVENTION_FILES) {
        try {
          fileContent = await this.github.getFileContent(owner, repo, file, sha);
          if (fileContent) {
            if (verbose) console.log(`   Found: ${file}`);
            break;
          }
        } catch {
          // File doesn't exist, try next
        }
      }
      if (!fileContent && verbose) {
        console.log('   No conventions file found');
      }
    }
    
    // Combine file content with inline instructions
    const inlineInstructions = this.config.review.instructions;
    
    if (fileContent && inlineInstructions) {
      return `${fileContent}\n\n---\n\n${inlineInstructions}`;
    } else if (fileContent) {
      return fileContent;
    } else if (inlineInstructions) {
      return inlineInstructions;
    }
    
    return undefined;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createReviewer(config: OpenReviewConfig): Reviewer {
  return new Reviewer(config);
}
