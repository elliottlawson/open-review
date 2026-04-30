/**
 * Core types for Open Review
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface OpenReviewConfig {
  version: string;
  review: ReviewConfig;
  llm?: LLMConfig;
  output?: OutputConfig;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'openrouter';
  model: string;
  api_key?: string;
}

export interface ReviewConfig {
  methodology: string; // 'default' or path to custom methodology
  presets: 'auto' | string[]; // 'auto' or list of preset names
  conventions: string; // 'auto', path to file, or inline text
}

export interface OutputConfig {
  format: 'human' | 'json';
  colors: 'auto' | 'true' | 'false';
  timezone: string;
  sections: {
    must_fix: SectionConfig;
    should_fix: SectionConfig;
    suggestions: SectionConfig;
    questions: SectionConfig;
  };
  verdicts: {
    approve: VerdictLabelConfig;
    changes_needed: VerdictLabelConfig;
    hold: VerdictLabelConfig;
  };
}

export interface SectionConfig {
  enabled: boolean;
  collapse: 'auto' | 'always' | 'never';
}

export interface VerdictLabelConfig {
  label: string;
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

export interface SectionSummaries {
  /** 1-2 sentence summary of critical issues - shown in Must Fix header */
  mustFix?: string;
  /** 1-2 sentence summary of warnings - shown in Should Fix header */
  shouldFix?: string;
  /** 1-2 sentence summary of discussion points - shown in Questions header */
  questions?: string;
  /** 1-2 sentence summary of suggestions - shown in Suggestions header */
  suggestions?: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  recommendation: 'approve' | 'changes_needed' | 'hold';
  tokensUsed: number;
  /** AI-generated summaries for each section header */
  sectionSummaries?: SectionSummaries;
  /** Warnings from the discipline validator (non-blocking) */
  disciplineWarnings?: string[];
}

export interface ReviewFinding {
  id: string;
  type: 'issue' | 'suggestion' | 'question';
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

export interface ReviewInput {
  /** What to review - can be file paths, a diff description, or general guidance */
  target: string;
  /** Additional context (e.g., PR description, ticket info) */
  context?: string;
  /** Ticket context: title, description, acceptance criteria. Passed explicitly by the user; not auto-fetched. */
  ticketContext?: string;
  /** Files that changed (helps focus the review) */
  changedFiles?: string[];
  /** The actual diff content */
  diff?: string;
}
