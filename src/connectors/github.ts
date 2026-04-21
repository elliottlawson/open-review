/**
 * GitHub Connector
 *
 * Handles all GitHub API interactions:
 * - Fetching PR context (info, diff, files)
 * - Managing comments (post, update, resolve)
 * - Tracking comment state via metadata
 */

import { Octokit } from '@octokit/rest';
import type { ReviewFinding } from '../core/types.js';

// ============================================================================
// Constants
// ============================================================================

const COMMENT_MARKER = '<!-- open-review:meta';
const COMMENT_MARKER_END = '-->';

// ============================================================================
// Types
// ============================================================================

export interface PRContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  headSha: string;
  baseBranch: string;
  author: string;
  files: PRFile[];
  existingComments: ReviewComment[];
}

export interface PRFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ReviewComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  author: string;
  createdAt: string;
  isOurs: boolean;
  metadata?: CommentMetadata;
}

export interface CommentMetadata {
  reviewId: string;
  commentId: string;
  type: 'summary' | 'inline';
  status: 'active' | 'resolved';
  createdAt: string;
  lastCommit: string;
  filePath?: string;
  line?: number;
  category?: string;
  findingKey?: string;
}

// ============================================================================
// GitHub Connector Class
// ============================================================================

export class GitHubConnector {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // ==========================================================================
  // PR Context Fetching
  // ==========================================================================

  async getPRContext(owner: string, repo: string, prNumber: number): Promise<PRContext> {
    // Fetch PR info
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Fetch changed files
    const { data: filesData } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const files: PRFile[] = filesData.map(f => ({
      path: f.filename,
      status: f.status as PRFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));

    // Fetch existing comments
    const existingComments = await this.getExistingComments(owner, repo, prNumber);

    return {
      owner,
      repo,
      number: prNumber,
      title: pr.title,
      body: pr.body || '',
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      author: pr.user?.login || 'unknown',
      files,
      existingComments,
    };
  }

  // ==========================================================================
  // Comment Management
  // ==========================================================================

  async getExistingComments(owner: string, repo: string, prNumber: number): Promise<ReviewComment[]> {
    // Get issue comments (PR-level summary comments)
    const { data: issueComments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    // Get review comments (inline comments on specific lines)
    const { data: reviewComments } = await this.octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const comments: ReviewComment[] = [];

    // Process issue comments
    for (const c of issueComments) {
      const metadata = this.parseMetadata(c.body || '');
      comments.push({
        id: c.id,
        body: c.body || '',
        author: c.user?.login || 'unknown',
        createdAt: c.created_at,
        isOurs: metadata !== null,
        metadata: metadata || undefined,
      });
    }

    // Process review comments
    for (const c of reviewComments) {
      const metadata = this.parseMetadata(c.body || '');
      comments.push({
        id: c.id,
        body: c.body || '',
        path: c.path,
        line: c.line || c.original_line || undefined,
        author: c.user?.login || 'unknown',
        createdAt: c.created_at,
        isOurs: metadata !== null,
        metadata: metadata || undefined,
      });
    }

    return comments;
  }

  /**
   * Post or update the summary comment
   * If a summary comment already exists, updates it in place
   * Otherwise creates a new one
   */
  async postSummaryComment(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    content: string,
    reviewId: string,
    isReReview: boolean,
  ): Promise<number> {
    // Check for existing summary comment
    const existing = await this.getExistingComments(owner, repo, prNumber);
    const existingSummary = existing.find(
      c => c.isOurs && c.metadata?.type === 'summary'
    );

    const metadata: CommentMetadata = {
      reviewId,
      commentId: existingSummary?.metadata?.commentId || this.generateId(),
      type: 'summary',
      status: 'active',
      createdAt: existingSummary?.metadata?.createdAt || new Date().toISOString(),
      lastCommit: headSha,
    };

    const body = this.formatComment(metadata, content);

    if (existingSummary) {
      // Update existing comment
      const { data } = await this.octokit.issues.updateComment({
        owner,
        repo,
        comment_id: existingSummary.id,
        body,
      });
      return data.id;
    } else {
      // Create new comment
      const { data } = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      return data.id;
    }
  }

  /**
   * Generate a unique key for a finding to track it across reviews
   * Based on file + category + line bucket (to differentiate multiple issues of same type)
   */
  generateFindingKey(finding: ReviewFinding): string {
    const file = finding.file || 'general';
    const category = finding.category;
    const lineBucket = finding.line ? Math.floor(finding.line / 25) : 0;
    return `${file}:${category}:${lineBucket}`;
  }

  /**
   * Find an existing inline comment that matches a finding
   */
  findExistingInlineComment(
    existingComments: ReviewComment[],
    finding: ReviewFinding,
  ): ReviewComment | undefined {
    const findingKey = this.generateFindingKey(finding);

    // Try to find a comment with matching findingKey
    const exactMatch = existingComments.find(c =>
      c.isOurs &&
      c.metadata?.type === 'inline' &&
      c.metadata?.findingKey === findingKey
    );

    if (exactMatch) {
      return exactMatch;
    }

    // Fall back to file + category for older comments
    const candidates = existingComments.filter(c =>
      c.isOurs &&
      c.metadata?.type === 'inline' &&
      c.metadata?.filePath === finding.file &&
      c.metadata?.category === finding.category
    );

    if (candidates.length === 0) {
      return undefined;
    }

    // Prefer one on the same line or closest line
    const sorted = candidates.sort((a, b) => {
      const aDist = Math.abs((a.metadata?.line || 0) - (finding.line || 0));
      const bDist = Math.abs((b.metadata?.line || 0) - (finding.line || 0));
      return aDist - bDist;
    });

    return sorted[0];
  }

  /**
   * Post or update an inline comment for a finding
   */
  async postInlineComment(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    finding: ReviewFinding,
    reviewId: string,
    existingComments: ReviewComment[],
  ): Promise<{ action: 'created' | 'updated' | 'moved' | 'skipped'; commentId: number | null }> {
    if (!finding.file || !finding.line) {
      return { action: 'skipped', commentId: null };
    }

    const findingKey = this.generateFindingKey(finding);
    const existingComment = this.findExistingInlineComment(existingComments, finding);

    const metadata: CommentMetadata = {
      reviewId,
      commentId: existingComment?.metadata?.commentId || this.generateId(),
      type: 'inline',
      status: 'active',
      createdAt: existingComment?.metadata?.createdAt || new Date().toISOString(),
      lastCommit: headSha,
      filePath: finding.file,
      line: finding.line,
      category: finding.category,
      findingKey,
    };

    const body = this.formatInlineComment(metadata, finding);

    let wasMovedFromOldLine = false;

    if (existingComment) {
      const existingLine = existingComment.metadata?.line || existingComment.line;
      const lineMoved = existingLine !== finding.line;

      if (lineMoved) {
        // Line moved - delete old comment and create new one
        wasMovedFromOldLine = true;
        try {
          await this.octokit.pulls.deleteReviewComment({
            owner,
            repo,
            comment_id: existingComment.id,
          });
        } catch (error) {
          console.warn(`Could not delete moved comment ${existingComment.id}: ${(error as Error).message}`);
        }
        // Fall through to create new comment
      } else {
        // Same line - update in place
        try {
          await this.octokit.pulls.updateReviewComment({
            owner,
            repo,
            comment_id: existingComment.id,
            body,
          });
          return { action: 'updated', commentId: existingComment.id };
        } catch (error) {
          console.warn(`Could not update inline comment ${existingComment.id}: ${(error as Error).message}`);
          return { action: 'skipped', commentId: null };
        }
      }
    }

    // Create new comment
    try {
      const { data } = await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: headSha,
        event: 'COMMENT',
        comments: [
          {
            path: finding.file,
            line: finding.line,
            body,
          },
        ],
      });
      return { action: wasMovedFromOldLine ? 'moved' : 'created', commentId: data.id };
    } catch (error) {
      console.warn(`Could not post inline comment on ${finding.file}:${finding.line}: ${(error as Error).message}`);
      return { action: 'skipped', commentId: null };
    }
  }

  /**
   * Resolve (delete) inline comments for issues that are no longer present
   */
  async resolveStaleInlineComments(
    owner: string,
    repo: string,
    existingComments: ReviewComment[],
    currentFindings: ReviewFinding[],
    verbose: boolean,
  ): Promise<number> {
    let resolvedCount = 0;

    const currentFindingKeys = new Set(
      currentFindings
        .filter(f => f.file && f.category)
        .map(f => this.generateFindingKey(f))
    );

    const currentFileCategorySet = new Set(
      currentFindings
        .filter(f => f.file && f.category)
        .map(f => `${f.file}:${f.category}`)
    );

    for (const comment of existingComments) {
      if (!comment.isOurs || comment.metadata?.type !== 'inline') {
        continue;
      }

      const filePath = comment.metadata?.filePath || comment.path;
      const category = comment.metadata?.category;

      if (!filePath || !category) {
        continue;
      }

      let isStale = false;

      if (comment.metadata?.findingKey) {
        isStale = !currentFindingKeys.has(comment.metadata.findingKey);
      } else {
        const existingKey = `${filePath}:${category}`;
        isStale = !currentFileCategorySet.has(existingKey);
      }

      if (isStale) {
        try {
          await this.octokit.pulls.deleteReviewComment({
            owner,
            repo,
            comment_id: comment.id,
          });
          resolvedCount++;
          if (verbose) {
            console.log(`   Resolved stale comment on ${filePath}:${comment.metadata?.line || '?'}`);
          }
        } catch (error) {
          console.warn(`Could not delete comment ${comment.id}: ${(error as Error).message}`);
        }
      }
    }

    return resolvedCount;
  }

  // ==========================================================================
  // Metadata Helpers
  // ==========================================================================

  private formatComment(metadata: CommentMetadata, content: string): string {
    const metaBlock = `${COMMENT_MARKER}\n${JSON.stringify(metadata, null, 2)}\n${COMMENT_MARKER_END}`;
    return `${metaBlock}\n\n${content}`;
  }

  private formatInlineComment(metadata: CommentMetadata, finding: ReviewFinding): string {
    const severity = finding.severity === 'critical' ? '🔴' :
                     finding.severity === 'warning' ? '🟡' : '🔵';

    let content = `${severity} **${finding.title}**\n\n${finding.description}`;

    if (finding.suggestedFix) {
      content += `\n\n**Suggested fix:**\n\n\`\`\`suggestion\n${finding.suggestedFix}\n\`\`\``;
    }

    return this.formatComment(metadata, content);
  }

  private parseMetadata(body: string): CommentMetadata | null {
    const startIdx = body.indexOf(COMMENT_MARKER);
    if (startIdx === -1) return null;

    const endIdx = body.indexOf(COMMENT_MARKER_END, startIdx);
    if (endIdx === -1) return null;

    const jsonStr = body.substring(startIdx + COMMENT_MARKER.length, endIdx).trim();
    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  private generateId(): string {
    return `or-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
