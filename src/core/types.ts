/**
 * Core types for Open Review
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface OpenReviewConfig {
  llm: LLMConfig;
  github: GitHubConfig;
  linear?: LinearConfig;
  review: ReviewConfig;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'openrouter';
  model: string;
}

export interface GitHubConfig {
  token: string;
}

export interface LinearConfig {
  apiKey: string;
}

export interface ReviewConfig {
  postComments: boolean;
  flagEmptyDescription?: boolean; // Flag PRs with no description (default: true)
  instructionsFile?: string; // Path to instructions/conventions file
  instructions?: string; // Inline instructions (appended to file if both present)
  ignore?: string[]; // Glob patterns to ignore
}

// ============================================================================
// PR Context Types
// ============================================================================

export interface PRContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
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
  patch?: string; // The diff content
  content?: string; // Full file content (fetched on demand)
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

// ============================================================================
// Comment Metadata (stored in comment body)
// ============================================================================

export interface CommentMetadata {
  reviewId: string;
  commentId: string;
  type: 'summary' | 'inline' | 'suggestion';
  status: 'active' | 'resolved' | 'whitelisted';
  createdAt: string;
  lastCommit: string;
  filePath?: string;
  line?: number;
  category?: string; // e.g., 'security', 'performance', 'style'
  findingKey?: string; // Unique key to identify same issue across reviews (file:category:title_hash)
}

// ============================================================================
// Linear Context Types
// ============================================================================

export interface LinearContext {
  issues: LinearIssue[];
}

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "UNO-123"
  title: string;
  description: string | null;
  state: string;
  priority: number;
  labels: string[];
  url: string;
}

// ============================================================================
// Review Types
// ============================================================================

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  recommendation: 'approve' | 'request_changes' | 'comment';
  tokensUsed: number;
}

export interface ReviewFinding {
  id: string;
  type: 'issue' | 'suggestion' | 'praise' | 'question';
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

// ============================================================================
// Review State (for tracking across commits)
// ============================================================================

export interface ReviewState {
  reviewId: string;
  prNumber: number;
  lastCommit: string;
  createdAt: string;
  updatedAt: string;
  findings: {
    [findingId: string]: {
      status: 'active' | 'resolved' | 'whitelisted';
      commentId?: number;
      resolvedAt?: string;
      resolvedBy?: 'code_change' | 'user_whitelist' | 'manual';
    };
  };
}

// ============================================================================
// Tool Types (for the AI agent)
// ============================================================================

export interface ReviewTools {
  readFile: (path: string) => Promise<string>;
  searchCode: (pattern: string, directory?: string) => Promise<SearchResult[]>;
  getFileContext: (path: string, line: number, context?: number) => Promise<string>;
  listDirectory: (path: string) => Promise<DirectoryEntry[]>;
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}
