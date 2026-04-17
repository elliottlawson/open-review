/**
 * GitHub Connector
 * 
 * Handles all GitHub API interactions:
 * - Fetching PR context (info, diff, files)
 * - Managing comments (post, update, resolve)
 * - Tracking comment state via metadata
 */

import { Octokit } from '@octokit/rest';
import type {
  PRContext,
  PRFile,
  ReviewComment,
  CommentMetadata,
  ReviewFinding,
} from '../core/types.js';

// ============================================================================
// Constants
// ============================================================================

const COMMENT_MARKER = '<!-- open-review:meta';
const COMMENT_MARKER_END = '-->';
const BOT_SIGNATURE = '\n\n---\n<sub>🔍 Reviewed by [Open Review](https://github.com/open-review/open-review)</sub>';

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
      per_page: 100, // May need pagination for large PRs
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
      state: pr.merged ? 'merged' : pr.state as 'open' | 'closed',
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      author: pr.user?.login || 'unknown',
      files,
      existingComments,
    };
  }
  
  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      
      if ('content' in data && data.type === 'file') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      
      throw new Error(`Path ${path} is not a file`);
    } catch (error) {
      if ((error as any).status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }
  
  // ==========================================================================
  // Comment Management
  // ==========================================================================
  
  async getExistingComments(owner: string, repo: string, prNumber: number): Promise<ReviewComment[]> {
    // Get issue comments (PR-level)
    const { data: issueComments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
    
    // Get review comments (inline)
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
  
  async postSummaryComment(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    summary: string,
    reviewId: string,
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
    
    const body = this.formatComment(metadata, summary);
    
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
   * Post a temporary "Reviewing..." progress comment.
   * This is a separate comment from the summary - it gets deleted when review completes.
   * This approach is safe: if review fails, we just delete this comment and the existing summary remains.
   */
  async postProgressComment(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<number> {
    const body = `⏳ **Reviewing...** Analyzing PR changes.\n\n---\n<sub>🔍 [Open Review](https://github.com/open-review/open-review)</sub>`;
    
    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    
    return data.id;
  }
  
  /**
   * Generate a unique key for a finding to track it across reviews.
   * Based on file + category + line bucket (to differentiate multiple issues of same type).
   * Line buckets are 25-line ranges to handle minor line shifts between commits.
   */
  generateFindingKey(finding: ReviewFinding): string {
    const file = finding.file || 'general';
    const category = finding.category;
    const lineBucket = finding.line ? Math.floor(finding.line / 25) : 0;
    return `${file}:${category}:${lineBucket}`;
  }

  /**
   * Find an existing inline comment that matches a finding.
   * Uses the findingKey (file + category + line bucket) for matching.
   * This allows multiple issues of the same category in the same file to have separate comments,
   * as long as they're in different 25-line buckets.
   */
  findExistingInlineComment(
    existingComments: ReviewComment[],
    finding: ReviewFinding,
  ): ReviewComment | undefined {
    const findingKey = this.generateFindingKey(finding);
    
    // First, try to find a comment with matching findingKey (most precise)
    const exactMatch = existingComments.find(c => 
      c.isOurs && 
      c.metadata?.type === 'inline' &&
      c.metadata?.findingKey === findingKey
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // Fall back to file + category + closest line for backwards compatibility
    // (for comments created before we added line buckets)
    const candidates = existingComments.filter(c => 
      c.isOurs && 
      c.metadata?.type === 'inline' &&
      c.metadata?.filePath === finding.file &&
      c.metadata?.category === finding.category &&
      !c.metadata?.findingKey // Only old-format comments without findingKey
    );
    
    if (candidates.length === 0) {
      return undefined;
    }
    
    // Multiple candidates - prefer one on the same line or closest line
    const sorted = candidates.sort((a, b) => {
      const aDist = Math.abs((a.metadata?.line || 0) - (finding.line || 0));
      const bDist = Math.abs((b.metadata?.line || 0) - (finding.line || 0));
      return aDist - bDist;
    });
    
    return sorted[0];
  }

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
    
    // If comment exists on the SAME line, update it in place
    // If comment exists but on a DIFFERENT line, delete it and create new (line moved)
    let wasMovedFromOldLine = false;
    
    if (existingComment) {
      const existingLine = existingComment.metadata?.line || existingComment.line;
      const lineMoved = existingLine !== finding.line;
      
      if (lineMoved) {
        // Line moved - delete old comment and create new one at correct line
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
        // Fall through to create new comment below
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
    
    // Create new comment (either no existing, or existing was on wrong line and deleted)
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
      // Line might not be in the diff
      console.warn(`Could not post inline comment on ${finding.file}:${finding.line}: ${(error as Error).message}`);
      return { action: 'skipped', commentId: null };
    }
  }
  
  /**
   * Resolve (delete) inline comments for issues that are no longer present.
   * A comment is stale if there's no current finding with the same findingKey.
   * Falls back to file+category for older comments without findingKey.
   */
  async resolveStaleInlineComments(
    owner: string,
    repo: string,
    existingComments: ReviewComment[],
    currentFindings: ReviewFinding[],
    verbose: boolean,
  ): Promise<number> {
    let resolvedCount = 0;
    
    // Build a set of current finding keys (new format: file:category:bucket)
    const currentFindingKeys = new Set(
      currentFindings
        .filter(f => f.file && f.category)
        .map(f => this.generateFindingKey(f))
    );
    
    // Also build file:category set for backwards compatibility
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
        continue; // Can't determine if stale without file+category
      }
      
      let isStale = false;
      
      // If comment has a findingKey, use that for precise matching
      if (comment.metadata?.findingKey) {
        isStale = !currentFindingKeys.has(comment.metadata.findingKey);
      } else {
        // Fall back to file+category for old-format comments
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
            console.log(`   Resolved stale comment on ${filePath}:${comment.metadata?.line || '?'} (${category})`);
          }
        } catch (error) {
          console.warn(`Could not delete comment ${comment.id}: ${(error as Error).message}`);
        }
      }
    }
    
    return resolvedCount;
  }
  
  async postReview(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    summary: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    reviewId: string,
  ): Promise<number> {
    const metadata: CommentMetadata = {
      reviewId,
      commentId: this.generateId(),
      type: 'summary',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastCommit: headSha,
    };
    
    const body = this.formatComment(metadata, summary);
    
    const { data } = await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: headSha,
      body,
      event,
    });
    
    return data.id;
  }
  
  async deleteComment(owner: string, repo: string, commentId: number): Promise<void> {
    await this.octokit.issues.deleteComment({
      owner,
      repo,
      comment_id: commentId,
    });
  }
  
  // ==========================================================================
  // Metadata Helpers
  // ==========================================================================
  
  private formatComment(metadata: CommentMetadata, content: string): string {
    const metaBlock = `${COMMENT_MARKER}\n${JSON.stringify(metadata, null, 2)}\n${COMMENT_MARKER_END}`;
    return `${metaBlock}\n\n${content}${BOT_SIGNATURE}`;
  }
  
  private formatInlineComment(metadata: CommentMetadata, finding: ReviewFinding): string {
    // Simple, human-like comment - no emoji bullets, no bold headers
    let content = finding.description;
    
    // Only add suggestion block if we have actual replacement code
    // (starts with valid code characters, not prose like "Use", "Add", "Create", etc.)
    if (finding.suggestedFix) {
      const fix = finding.suggestedFix.trim();
      const looksLikeCode = /^[a-z$_@#<\-\/\*\s'"(`{[]|^return |^public |^private |^protected |^function |^class |^const |^let |^var |^if |^for |^while /i.test(fix);
      const looksLikeProse = /^(Use|Add|Create|Change|Replace|Remove|Consider|Move|Extract|Wrap|Call|Instead|Should|Could|Would|Try|Make|Set|Get|Put|Update|Delete|Insert|Implement|Define|Declare)/i.test(fix);
      
      if (looksLikeCode && !looksLikeProse) {
        content += `\n\n\`\`\`suggestion\n${fix}\n\`\`\``;
      } else {
        // It's prose - just add it as a note, not a suggestion block
        content += `\n\n${fix}`;
      }
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

// ============================================================================
// Factory Function
// ============================================================================

export function createGitHubConnector(token: string): GitHubConnector {
  return new GitHubConnector(token);
}
