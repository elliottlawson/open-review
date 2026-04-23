/**
 * Agent Output Formatter
 *
 * Token-efficient JSON output for consumption by other agents and CI/CD systems.
 * Preserves all fields from ReviewFinding for downstream formatters.
 */

import type { ReviewResult, ReviewFinding, OutputConfig } from '../core/types.js';

export interface AgentSectionSummaries {
  mustFix?: string;
  shouldFix?: string;
  questions?: string;
  suggestions?: string;
}

export interface AgentOutput {
  verdict: 'approve' | 'changes_needed' | 'hold';
  summary: string;
  findings: AgentFinding[];
  sectionSummaries?: AgentSectionSummaries;
  stats: {
    critical: number;
    warnings: number;
    suggestions: number;
    tokens: number;
  };
}

/**
 * AgentFinding mirrors ReviewFinding structure exactly.
 * This ensures downstream formatters (like GitHub Action) have access to all fields.
 */
export interface AgentFinding {
  id?: string;
  type: 'issue' | 'suggestion' | 'question';
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

export function formatForAgent(result: ReviewResult, config?: OutputConfig): AgentOutput {
  // Filter findings based on section visibility
  const filteredFindings = result.findings.filter(f => {
    // Critical issues (must_fix)
    if (f.severity === 'critical' && config?.sections?.must_fix?.enabled === false) {
      return false;
    }
    // Warnings (should_fix)
    if (f.severity === 'warning' && config?.sections?.should_fix?.enabled === false) {
      return false;
    }
    // Suggestions (suggestions)
    if (f.severity === 'info' && f.type !== 'question' && config?.sections?.suggestions?.enabled === false) {
      return false;
    }
    // Questions (questions)
    if (f.type === 'question' && config?.sections?.questions?.enabled === false) {
      return false;
    }
    return true;
  });

  const findings: AgentFinding[] = filteredFindings
    .map(f => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      file: f.file,
      line: f.line,
      suggestedFix: f.suggestedFix,
    }));

  return {
    verdict: result.recommendation,
    summary: result.summary,
    findings,
    sectionSummaries: result.sectionSummaries,
    stats: {
      critical: filteredFindings.filter(f => f.severity === 'critical').length,
      warnings: filteredFindings.filter(f => f.severity === 'warning').length,
      suggestions: filteredFindings.filter(f => f.severity === 'info').length,
      tokens: result.tokensUsed,
    },
  };
}

export function toJSON(result: ReviewResult, pretty = false, config?: OutputConfig): string {
  const output = formatForAgent(result, config);
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

export interface SkippedOutput {
  skipped: true;
  reason: string;
  files: string[];
}

export function toSkippedJSON(files: string[], pretty = false): string {
  const output: SkippedOutput = {
    skipped: true,
    reason: 'Changes only affect excluded file types',
    files,
  };
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}
