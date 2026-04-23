/**
 * PR Review Comment Template System
 *
 * Architecture:
 * - Content Layer: AI generates ReviewFinding[] (just text/content)
 * - Template Layer: This file maps findings to sections
 * - Presentation Layer: Components render GitHub-compatible markdown
 * - Configuration: Users control which sections appear and how they behave
 *
 * Design Principles:
 * 1. AI only outputs content (titles, descriptions) - NO styling concerns
 * 2. Components handle ALL formatting - consistent, testable, changeable
 * 3. Configurability is declarative - users set options, not prompt engineering
 * 4. GitHub-compatible output is the constraint we design within
 */

import type { ReviewFinding, ReviewResult, OutputConfig } from '../core/types.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface SectionConfig {
  /** Whether this section appears in the output */
  enabled: boolean;
  /** Collapse behavior: auto (based on count), always, never */
  collapse?: 'auto' | 'always' | 'never';
}

export interface CommentTemplateConfig {
  /** Top-level verdict line (always enabled) */
  verdict: { enabled: true };

  /** Summary - brief overview (required when not approved, skip for clean approval) */
  summary: SectionConfig;

  /** Critical blocking issues */
  mustFix: SectionConfig;

  /** Non-blocking improvements */
  shouldFix: SectionConfig;

  /** Nice-to-have suggestions (collapsible) */
  suggestions: SectionConfig;

  /** Questions for discussion (shown in 'hold' state) */
  questions: SectionConfig;

  /** Additional comments (general feedback, not tied to findings) */
  additionalComments: SectionConfig;

  /** Feedback (whitelist, ignore rules, per-PR overrides) */
  feedback: SectionConfig;

  /** Footer - timestamp and tracking */
  footer: SectionConfig;

  /** Verdict labels */
  verdicts?: OutputConfig['verdicts'];

  /** Timezone for timestamps */
  timezone?: string;
}

/** Default configuration - sensible defaults that work for most teams */
export const DEFAULT_TEMPLATE_CONFIG: CommentTemplateConfig = {
  verdict: { enabled: true },
  summary: { enabled: true },
  mustFix: { enabled: true, collapse: 'auto' },
  shouldFix: { enabled: true, collapse: 'auto' },
  suggestions: { enabled: true, collapse: 'auto' },
  questions: { enabled: true, collapse: 'auto' },
  additionalComments: { enabled: true },
  feedback: { enabled: false },
  footer: { enabled: true },
};

/** Minimal configuration - just the verdict and critical issues */
export const MINIMAL_TEMPLATE_CONFIG: CommentTemplateConfig = {
  verdict: { enabled: true },
  summary: { enabled: true },
  mustFix: { enabled: true, collapse: 'auto' },
  shouldFix: { enabled: false },
  suggestions: { enabled: false },
  questions: { enabled: false },
  additionalComments: { enabled: false },
  feedback: { enabled: false },
  footer: { enabled: true },
};

/** Verbose configuration - show everything expanded */
export const VERBOSE_TEMPLATE_CONFIG: CommentTemplateConfig = {
  verdict: { enabled: true },
  summary: { enabled: true },
  mustFix: { enabled: true, collapse: 'never' },
  shouldFix: { enabled: true, collapse: 'never' },
  suggestions: { enabled: true, collapse: 'never' },
  questions: { enabled: true, collapse: 'never' },
  additionalComments: { enabled: true },
  feedback: { enabled: true },
  footer: { enabled: true },
};

// ============================================================================
// Design Tokens (Visual System)
// ============================================================================

const Colors = {
  success: '#2da44e',
  warning: '#fb8500',
  danger: '#cf222e',
  info: '#0969da',
  purple: '#8957e5',
  muted: '#57606a',
} as const;

const Icons = {
  // Large icons for verdict line (28x28)
  approved: `<svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.success}; vertical-align: middle; margin-right: 8px;"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,

  changes: `<svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.warning}; vertical-align: middle; margin-right: 8px;"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`,

  hold: `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="color: ${Colors.purple}; vertical-align: middle; margin-right: 8px;"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>`,

  // Small icons for sections (16x16)
  mustFix: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.danger}; vertical-align: middle; margin-right: 6px;"><path d="M4.47.22A.75.75 0 015 0h6a.75.75 0 01.53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 01-.22.53l-4.25 4.25A.75.75 0 0111 16H5a.75.75 0 01-.53-.22L.22 11.53A.75.75 0 010 11V5a.75.75 0 01.22-.53L4.47.22zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5H5.31zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/></svg>`,

  shouldFix: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color: ${Colors.warning}; vertical-align: middle; margin-right: 6px;"><rect x="5.5" y="5.5" width="5" height="5" transform="rotate(45 8 8)" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /></svg>`,

  suggestion: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.info}; vertical-align: middle; margin-right: 6px;"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 01-1.484.211c-.04-.282-.163-.547-.37-.847a8.695 8.695 0 00-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.75.75 0 01-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75zM6.75 15.25a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0z"/></svg>`,

  question: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.purple}; vertical-align: middle; margin-right: 6px;"><path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0110.25 10H7.061l-2.574 2.573A1.458 1.458 0 012 11.543V10h-.25A1.75 1.75 0 010 8.25v-5.5C0 1.784.784 1 1.75 1zM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h3.5a.25.25 0 00.25-.25v-5.5a.25.25 0 00-.25-.25h-8.5a.25.25 0 00-.25.25zm13 2a.25.25 0 00-.25-.25h-.5a.75.75 0 010-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0114.25 12H14v1.543a1.458 1.458 0 01-2.487 1.03L9.22 12.28a.75.75 0 111.06-1.06l2.22 2.22v-2.19a.75.75 0 01.75-.75h1a.25.25 0 00.25-.25v-5.5z"/></svg>`,

  note: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.info}; vertical-align: middle; margin-right: 6px;"><path d="M2 2.5A1.5 1.5 0 013.5 1h9A1.5 1.5 0 0114 2.5v11A1.5 1.5 0 0112.5 15h-9A1.5 1.5 0 012 13.5v-11zM3.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5h-9zM5 4h6v1H5V4zm0 2h6v1H5V6zm0 2h6v1H5V8z"/></svg>`,

  feedback: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.purple}; vertical-align: middle; margin-right: 6px;"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 01-1.484.211c-.04-.282-.163-.547-.37-.847a8.695 8.695 0 00-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.75.75 0 01-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75zM6.75 15.25a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0z"/></svg>`,

  clock: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="color: ${Colors.muted}; vertical-align: middle; margin-right: 6px;"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zm7-3.25v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5a.75.75 0 011.5 0z"/></svg>`,
} as const;

// ============================================================================
// Primitive Helpers
// ============================================================================

function mustFixHeader(icon: string, title: string): string {
  return `\n${icon}### ${title}\n\n`;
}

function shouldFixHeader(icon: string, title: string): string {
  return `\n${icon}### ${title}\n\n`;
}

function questionsHeader(icon: string, title: string): string {
  return `\n${icon}### ${title}\n\n`;
}

function bold(text: string): string {
  return `**${text}**`;
}

function muted(text: string): string {
  // GitHub supports some HTML styling
  return `<span style="color: ${Colors.muted};">${text}</span>`;
}

function code(text: string): string {
  return `\`${text}\``;
}

function location(file: string, line?: number): string {
  const loc = line ? `${file}:${line}` : file;
  return code(loc);
}

function details(summary: string, content: string, open: boolean = false): string {
  const openAttr = open ? ' open' : '';
  return `<details${openAttr}>
<summary>${summary}</summary>

${content}
</details>`;
}

function shouldCollapse(
  config: 'auto' | 'always' | 'never' | undefined,
  itemCount: number
): boolean {
  if (config === 'always') return true;
  if (config === 'never') return false;
  // auto: collapse if more than 3 items
  return itemCount > 3;
}

// ============================================================================
// Section Components
// ============================================================================

interface SectionProps {
  findings: ReviewFinding[];
  config: SectionConfig;
}

/** ① VERDICT LINE - Always shown, answers "should I merge?" */
function VerdictSection(result: ReviewResult, verdicts?: OutputConfig['verdicts']): string {
  const state = result.recommendation === 'approve' ? 'approved' :
                result.recommendation === 'changes_needed' ? 'changes' : 'hold';

  const config = {
    approved: { icon: Icons.approved, text: verdicts?.approve?.label || 'LGTM', subtext: 'approve and merge', color: Colors.success },
    changes_needed: { icon: Icons.changes, text: verdicts?.changes_needed?.label || 'Changes needed', subtext: 'do not merge', color: Colors.warning },
    hold: { icon: Icons.hold, text: verdicts?.hold?.label || 'Hold', subtext: "let's discuss the approach", color: Colors.purple },
  }[state];

  return `${config.icon}${bold(config.text)} ${muted(`— ${config.subtext}`)}`;
}

/** PROGRESS STATE - Shown while review is running */
function ProgressSection(): string {
  return `⏳ **Review in progress...**\n\nAnalyzing changes and will update this comment when complete.`;
}

/** ERROR STATE - Shown when review fails */
function ErrorSection(result: ReviewResult): string {
  const prevReview = result.summary || 'Previous review';
  return `❌ **Review failed**\n\nUnable to complete code review.\n\n${prevReview}`;
}

/** ② SUMMARY - Brief overview, required when not approved */
function SummarySection(result: ReviewResult, config: SectionConfig): string {
  if (!config.enabled) return '';

  // Hide summary for clean approvals
  if (result.recommendation === 'approve' && result.findings.length === 0) {
    return '';
  }

  // Required when verdict is changes or hold
  if (!result.summary || result.summary.trim().length === 0) {
    return '';
  }

  return `\n${result.summary}`;
}

/** ③ MUST FIX - Critical blocking issues */
function MustFixSection(findings: ReviewFinding[], config: SectionConfig): string {
  if (!config.enabled) return '';

  const critical = findings.filter(f => f.severity === 'critical');
  if (critical.length === 0) return '';

  const items = critical.map((f, i) => {
    const loc = f.file ? ` — ${location(f.file, f.line)}` : '';
    return `**${i + 1}. ${f.title}**${loc}`;
  }).join('\n');

  const collapsed = shouldCollapse(config.collapse, critical.length);

  if (collapsed) {
    return mustFixHeader(Icons.mustFix, 'Must fix') + '\n' + details(
      `${critical.length} critical issues`,
      items,
      false
    );
  }

  return mustFixHeader(Icons.mustFix, 'Must fix') + '\n' + items;
}

/** ④ SHOULD FIX (OPTIONAL) - Non-blocking improvements */
function ShouldFixSection(findings: ReviewFinding[], config: SectionConfig): string {
  if (!config.enabled) return '';

  const warnings = findings.filter(f => f.severity === 'warning');
  if (warnings.length === 0) return '';

  const items = warnings.map(f => {
    const loc = f.file ? ` — ${location(f.file, f.line)}` : '';
    return `**- ${f.title}**${loc}`;
  }).join('\n');

  const collapsed = shouldCollapse(config.collapse, warnings.length);

  if (collapsed) {
    return shouldFixHeader(Icons.shouldFix, 'Should fix') + '\n' + details(
      `${warnings.length} warnings`,
      items,
      false
    );
  }

  return shouldFixHeader(Icons.shouldFix, 'Should fix') + '\n' + items;
}

/** ⑤ SUGGESTIONS (COLLAPSIBLE) - Nice-to-have, configurable collapse state */
function SuggestionsSection(
  findings: ReviewFinding[],
  config: SectionConfig
): string {
  if (!config.enabled) return '';

  const suggestions = findings.filter(f =>
    f.severity === 'info' && f.type !== 'question'
  );
  if (suggestions.length === 0) return '';

  const items = suggestions.map(f => {
    const loc = f.file ? ` — ${location(f.file, f.line)}` : '';
    return `- ${f.title}${loc}`;
  }).join('\n');

  const collapsed = shouldCollapse(config.collapse, suggestions.length);

  return '\n' + details(
    `${Icons.suggestion}Suggestions (non-blocking)`,
    items,
    !collapsed
  );
}

/** QUESTIONS - For hold/discussion state */
function QuestionsSection(findings: ReviewFinding[], config?: SectionConfig): string {
  if (!config?.enabled) return '';

  const questions = findings.filter(f => f.type === 'question');
  if (questions.length === 0) return '';

  const items = questions.map(f => `**- ${f.title}**`).join('\n');

  const collapsed = shouldCollapse(config?.collapse, questions.length);

  if (collapsed) {
    return questionsHeader(Icons.question, 'Questions for the team') + '\n' + details(
      `${questions.length} questions`,
      items,
      false
    );
  }

  return questionsHeader(Icons.question, 'Questions for the team') + '\n' + items;
}

/** ADDITIONAL COMMENTS - General feedback not tied to findings */
function AdditionalCommentsSection(findings: ReviewFinding[], config?: SectionConfig): string {
  // TODO: Add 'comment' type to ReviewFinding type for full support
  if (!config?.enabled) return '';
  return '';
}

/** FEEDBACK - User overrides, whitelist, ignore rules (future) */
function FeedbackSection(config?: SectionConfig): string {
  // TODO: Implement when we add feedback/whitelist feature
  if (!config?.enabled) return '';
  return '';
}

/** ⑥ FOOTER - Timestamp only, ALWAYS LAST */
function FooterSection(
  isReReview: boolean,
  config: CommentTemplateConfig['footer'],
  timezone?: string
): string {
  if (!config.enabled) return '';

  const parts: string[] = ['\n---\n'];

  // Timestamp (always shown on re-reviews)
  if (isReReview) {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'America/New_York',
    });
    parts.push(`${Icons.clock}${muted(`Last updated: ${formatted}`)}`);
  }

  return parts.join('');
}

// ============================================================================
// Main Template Function
// ============================================================================

export interface RenderCommentOptions {
  result: ReviewResult;
  config?: CommentTemplateConfig;
  /** Review state: progress | error | complete */
  state?: 'progress' | 'error' | 'complete';
  isReReview?: boolean;
}

/**
 * Renders a complete PR review comment based on the template configuration.
 *
 * The AI generates: ReviewResult (summary, findings[], recommendation)
 * The template maps: findings -> sections based on severity/type
 * The config controls: which sections appear, collapsed/expanded state
 */
export function renderComment(options: RenderCommentOptions): string {
  const {
    result,
    config = DEFAULT_TEMPLATE_CONFIG,
    state = 'complete', // 'progress' | 'error' | 'complete'
    isReReview = false,
  } = options;

  const parts: string[] = [];

  // ① PROGRESS / ERROR STATE (if applicable)
  if (state === 'progress') {
    parts.push(ProgressSection());
  } else if (state === 'error') {
    parts.push(ErrorSection(result));
  }

  if (state === 'complete') {
    // ② VERDICT LINE (always for complete)
    parts.push(VerdictSection(result, config.verdicts));

    // Clean approval - just the verdict
    if (result.recommendation === 'approve' && result.findings.length === 0) {
      return parts.join('');
    }

    // ③ SUMMARY (required when not approved, skip for clean)
    parts.push(SummarySection(result, config.summary));

    // ④ MUST FIX
    parts.push(MustFixSection(result.findings, config.mustFix));

    // ⑤ SHOULD FIX
    parts.push(ShouldFixSection(result.findings, config.shouldFix));

    // ⑥ QUESTIONS (for hold state)
    parts.push(QuestionsSection(result.findings, config.questions));

    // ⑦ SUGGESTIONS (collapsible)
    parts.push(SuggestionsSection(result.findings, config.suggestions));

    // ⑧ ADDITIONAL COMMENTS
    parts.push(AdditionalCommentsSection(result.findings, config.additionalComments));

    // ⑨ FEEDBACK (future - user overrides)
    parts.push(FeedbackSection(config.feedback));
  }

  // ⑩ FOOTER (ALWAYS LAST)
  parts.push(FooterSection(isReReview, config.footer, config.timezone));

  return parts.join('');
}

// ============================================================================
// Inline Comment Template
// ============================================================================

export interface InlineCommentOptions {
  finding: ReviewFinding;
  showSuggestedFix?: boolean;
}

/**
 * Renders an inline comment for a specific finding.
 * Used when posting comments on specific lines of code.
 */
export function renderInlineComment(options: InlineCommentOptions): string {
  const { finding, showSuggestedFix = true } = options;

  const severityIcon = finding.severity === 'critical' ? '🔴' :
                       finding.severity === 'warning' ? '🟡' : '🔵';

  const parts: string[] = [
    `${severityIcon} **${finding.title}**`,
    '',
    finding.description,
  ];

  if (showSuggestedFix && finding.suggestedFix) {
    parts.push('', '**Suggested fix:**', '```suggestion', finding.suggestedFix, '```');
  }

  return parts.join('\n');
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Loads template configuration from user settings.
 * Merges with defaults for any missing values.
 */
export function loadTemplateConfig(
  userConfig?: Partial<CommentTemplateConfig>
): CommentTemplateConfig {
  if (!userConfig) return DEFAULT_TEMPLATE_CONFIG;

  return {
    verdict: { enabled: true },
    summary: { ...DEFAULT_TEMPLATE_CONFIG.summary, ...userConfig.summary },
    mustFix: { ...DEFAULT_TEMPLATE_CONFIG.mustFix, ...userConfig.mustFix },
    shouldFix: { ...DEFAULT_TEMPLATE_CONFIG.shouldFix, ...userConfig.shouldFix },
    suggestions: { ...DEFAULT_TEMPLATE_CONFIG.suggestions, ...userConfig.suggestions },
    questions: { ...DEFAULT_TEMPLATE_CONFIG.questions, ...userConfig.questions },
    additionalComments: { ...DEFAULT_TEMPLATE_CONFIG.additionalComments, ...userConfig.additionalComments },
    feedback: { ...DEFAULT_TEMPLATE_CONFIG.feedback, ...userConfig.feedback },
    footer: { ...DEFAULT_TEMPLATE_CONFIG.footer, ...userConfig.footer },
    verdicts: userConfig.verdicts,
    timezone: userConfig.timezone,
  };
}

/**
 * Creates a CommentTemplateConfig from OutputConfig
 */
export function createTemplateConfigFromOutputConfig(
  outputConfig: OutputConfig
): CommentTemplateConfig {
  return {
    verdict: { enabled: true },
    summary: { enabled: true },
    mustFix: { 
      enabled: outputConfig.sections.must_fix.enabled,
      collapse: outputConfig.sections.must_fix.collapse,
    },
    shouldFix: { 
      enabled: outputConfig.sections.should_fix.enabled,
      collapse: outputConfig.sections.should_fix.collapse,
    },
    suggestions: { 
      enabled: outputConfig.sections.suggestions.enabled,
      collapse: outputConfig.sections.suggestions.collapse,
    },
    questions: { 
      enabled: outputConfig.sections.questions.enabled,
      collapse: outputConfig.sections.questions.collapse,
    },
    additionalComments: { enabled: true },
    feedback: { enabled: false },
    footer: { enabled: true },
    verdicts: outputConfig.verdicts,
    timezone: outputConfig.timezone,
  };
}
