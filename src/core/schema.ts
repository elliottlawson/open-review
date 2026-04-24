/**
 * Structured Output Schemas
 *
 * Zod schemas for the agent's structured output. Rich .describe() strings
 * embed output discipline rules so the model receives them as part of the
 * structured output instructions.
 */

import { z } from 'zod';

export const FindingSchema = z.object({
  type: z.enum(['issue', 'suggestion', 'question']).describe(
    'The type of finding. Only include real issues. Skip entirely for clean approvals.'
  ),
  severity: z.enum(['critical', 'warning', 'info']).describe(
    'Severity. Prioritize: approach issues → security → quality. Do not inflate severity.'
  ),
  category: z.string().describe(
    'Category like "security", "performance", "error-handling", "architecture", "style"'
  ),
  title: z.string().describe('Short, specific title for the finding'),
  description: z.string().describe('Detailed explanation. Be concise. 1-3 sentences.'),
  file: z.string().optional().describe('File path. Always include when applicable.'),
  line: z.number().optional().describe('Line number. Always include when applicable.'),
  suggestedFix: z.string().optional().describe(
    'Code suggestion with actual code when possible. Omit if you cannot provide a concrete fix.'
  ),
});

export const SectionSummariesSchema = z.object({
  mustFix: z.string().optional().describe(
    "1-2 sentence summary of what's most important about critical issues. " +
    "Highlight the key theme, not just a count. " +
    'Example: "Missing strict types and null checks will cause runtime errors."'
  ),
  shouldFix: z.string().optional().describe(
    "1-2 sentence summary of what's most important about warnings. " +
    'Highlight the key theme, not just a count.'
  ),
  questions: z.string().optional().describe(
    '1-2 sentence summary of discussion points. Highlight the key theme.'
  ),
  suggestions: z.string().optional().describe(
    "1-2 sentence summary of suggestions. Highlight the key theme, not just a count."
  ),
});

export const ReviewResultSchema = z.object({
  verdict: z.enum(['approve', 'changes_needed', 'hold']).describe(
    "Overall recommendation. 'approve' only if there are no blocking issues. " +
    "'changes_needed' when real issues exist — do not manufacture issues. " +
    "'hold' for architectural or approach concerns that need discussion first."
  ),
  summary: z.string().describe(
    "Brief summary. Verdict-first thinking, but do NOT include verdict labels or emojis here. " +
    'The template layer renders ✅ LGTM / 🔄 Changes needed. This field explains why. ' +
    'Clean approval: 1-2 sentences max, or omit entirely. Never explain why good code is good. ' +
    'Issues found: state the main concern in one sentence. Max 3-4 sentences total.'
  ),
  findings: z.array(FindingSchema).describe(
    'List of findings. Only real issues. Skip entirely for clean approvals. ' +
    'If the same issue repeats across files, include it once and note it applies broadly. ' +
    'Prioritize: approach → security → quality. Always include file paths and line numbers.'
  ),
  sectionSummaries: SectionSummariesSchema.optional().describe(
    'AI-generated summaries for each section that has findings. 1-2 sentences per section. ' +
    'Highlight key themes, not counts.'
  ),
});

export type FindingOutput = z.infer<typeof FindingSchema>;
export type SectionSummariesOutput = z.infer<typeof SectionSummariesSchema>;
export type ReviewResultOutput = z.infer<typeof ReviewResultSchema>;
