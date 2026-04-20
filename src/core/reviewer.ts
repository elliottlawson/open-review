/**
 * Review Orchestrator
 *
 * Coordinates the full review workflow:
 * 1. Fetch PR context from GitHub
 * 2. Generate review using LLM
 * 3. Post/update comments on GitHub
 */

import { GitHubConnector, type PRContext } from '../connectors/github.js';
import { runReview, type ReviewAgentConfig } from './agent.js';
import type { OpenReviewConfig, ReviewResult, ReviewFinding } from './types.js';
import { renderComment, DEFAULT_TEMPLATE_CONFIG } from '../output/index.js';

// Fallback convention file names to look for (in order of priority)
const CONVENTION_FILES = [
  'CONVENTIONS.md',
  'CLAUDE.md',
  '.github/CONVENTIONS.md',
  'docs/conventions.md',
  'docs/CONVENTIONS.md',
  '.open-review/instructions.md',
];

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
  result: ReviewResult;
  commentId?: number;
  postedFindings: number;
  formattedComment: string;
}

// ============================================================================
// Reviewer
// ============================================================================

export class Reviewer {
  private github: GitHubConnector;
  private config: OpenReviewConfig;

  constructor(config: OpenReviewConfig) {
    this.config = config;
    this.github = new GitHubConnector(config.github.token);
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

    // Check if this is a re-review (has existing summary comment)
    const existingSummary = prContext.existingComments.find(
      c => c.isOurs && c.metadata?.type === 'summary'
    );
    const isReReview = !!existingSummary;

    if (verbose) {
      console.log(`   Title: ${prContext.title}`);
      console.log(`   Files: ${prContext.files.length}`);
      console.log(`   Is re-review: ${isReReview}`);
    }

    // Step 2: Post progress placeholder (if not dry run)
    if (!dryRun && this.config.review.postComments) {
      if (verbose) console.log('⏳ Posting progress indicator...');
      const progressBody = isReReview
        ? `🔄 **Re-reviewing...** Analyzing new changes for commit \`${prContext.headSha.substring(0, 7)}\`.`
        : `⏳ **Review in progress...** Analyzing PR changes.`;

      try {
        await this.github.postSummaryComment(
          owner,
          repo,
          prNumber,
          prContext.headSha,
          progressBody,
          reviewId,
          isReReview
        );
      } catch (error) {
        if (verbose) console.log(`   Could not post progress: ${(error as Error).message}`);
      }
    }

    // Step 3: Load instructions
    if (verbose) console.log('📜 Loading review instructions...');
    const instructions = await this.loadInstructions(owner, repo, prContext.headSha, verbose);

    // Step 4: Generate review using LLM
    if (verbose) console.log('🤖 Generating review...');

    const agentConfig: ReviewAgentConfig = {
      basePath: process.cwd(), // Will use git to get actual files
      model: `${this.config.llm.provider}/${this.config.llm.model}`,
      maxSteps: 100,
      instructions,
    };

    const result = await runReview(agentConfig, {
      target: `Review PR #${prNumber}: ${prContext.title}`,
      context: prContext.body || undefined,
      changedFiles: prContext.files.map(f => f.path),
    });

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
          description: 'Consider adding a description to explain what this PR does and why.',
        });
      }
    }

    if (verbose) {
      console.log(`   Findings: ${result.findings.length}`);
      console.log(`   Recommendation: ${result.recommendation}`);
      console.log(`   Tokens used: ${result.tokensUsed}`);
    }

    // Step 5: Format and post comments
    let commentId: number | undefined;
    let postedFindings = 0;
    const formattedComment = this.formatSummaryComment(result, isReReview);

    if (!dryRun && this.config.review.postComments) {
      if (verbose) console.log('💬 Posting review...');

      // Post/update summary comment
      commentId = await this.github.postSummaryComment(
        owner,
        repo,
        prNumber,
        prContext.headSha,
        formattedComment,
        reviewId,
        isReReview
      );

      if (verbose) console.log(`   Posted summary comment #${commentId}`);

      // Handle inline comments (if enabled)
      const inlineCommentsEnabled = this.config.review.inlineComments !== false;

      if (inlineCommentsEnabled) {
        // Get findings that can be posted inline
        const inlineFindings = result.findings.filter(f => f.file && f.line);

        // Resolve stale inline comments
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

        // Post/update inline comments
        let createdCount = 0;
        let updatedCount = 0;
        let movedCount = 0;

        for (const finding of inlineFindings) {
          const postResult = await this.github.postInlineComment(
            owner,
            repo,
            prNumber,
            prContext.headSha,
            finding,
            reviewId,
            prContext.existingComments
          );

          if (postResult.action === 'created') {
            createdCount++;
            if (verbose) console.log(`   Created inline comment on ${finding.file}:${finding.line}`);
          } else if (postResult.action === 'updated') {
            updatedCount++;
            if (verbose) console.log(`   Updated inline comment on ${finding.file}:${finding.line}`);
          } else if (postResult.action === 'moved') {
            movedCount++;
            if (verbose) console.log(`   Moved inline comment to ${finding.file}:${finding.line}`);
          }
        }

        postedFindings = createdCount + updatedCount + movedCount;
      } else {
        // Inline comments disabled - resolve all existing inline comments
        const resolved = await this.github.resolveStaleInlineComments(
          owner,
          repo,
          prContext.existingComments,
          [], // No inline findings
          verbose
        );
        if (resolved > 0 && verbose) {
          console.log(`   Resolved ${resolved} inline comments (inline comments disabled)`);
        }

        // Add findings to summary if inline is disabled
        if (result.findings.length > 0) {
          const findingsInSummary = this.formatFindingsForSummary(result.findings);
          const updatedBody = `${formattedComment}\n\n<details>\n<summary>View all ${result.findings.length} findings</summary>\n\n${findingsInSummary}\n</details>`;

          await this.github.postSummaryComment(
            owner,
            repo,
            prNumber,
            prContext.headSha,
            updatedBody,
            reviewId,
            isReReview
          );
        }
      }
    } else if (dryRun && verbose) {
      console.log('🔍 Dry run - not posting comments');
    }

    return {
      reviewId,
      prContext,
      result,
      commentId,
      postedFindings,
      formattedComment,
    };
  }

  // ==========================================================================
  // Formatting
  // ==========================================================================

  private formatSummaryComment(result: ReviewResult, isReReview: boolean): string {
    return renderComment({
      result,
      config: DEFAULT_TEMPLATE_CONFIG,
      state: 'complete',
      isReReview,
    });
  }

  private formatFindingsForSummary(findings: ReviewFinding[]): string {
    const lines: string[] = [];

    for (const finding of findings) {
      const severity = finding.severity === 'critical' ? '🔴' :
                       finding.severity === 'warning' ? '🟡' : '🔵';
      const location = finding.file ? `\`${finding.file}${finding.line ? `:${finding.line}` : ''}\`` : '';

      lines.push(`${severity} **${finding.title}** ${location}`);
      lines.push('');
      lines.push(finding.description);

      if (finding.suggestedFix) {
        lines.push('');
        lines.push('**Suggested fix:**');
        lines.push('```');
        lines.push(finding.suggestedFix);
        lines.push('```');
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private generateReviewId(): string {
    return `review-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private async loadInstructions(
    owner: string,
    repo: string,
    sha: string,
    verbose: boolean
  ): Promise<string | undefined> {
    // This would need to be implemented to fetch from GitHub API
    // For now, check local files
    const fs = await import('fs');
    const path = await import('path');

    for (const file of CONVENTION_FILES) {
      if (fs.existsSync(file)) {
        if (verbose) console.log(`   Found: ${file}`);
        return fs.readFileSync(file, 'utf-8');
      }
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
