/**
 * Agent Output Formatter
 *
 * Token-efficient JSON output for consumption by other agents and CI/CD systems.
 * Preserves all fields from ReviewFinding for downstream formatters.
 */

import type { ReviewResult, ReviewFinding } from '../core/types.js';

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

export function formatForAgent(result: ReviewResult): AgentOutput {
  const findings: AgentFinding[] = result.findings
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
      critical: result.findings.filter(f => f.severity === 'critical').length,
      warnings: result.findings.filter(f => f.severity === 'warning').length,
      suggestions: result.findings.filter(f => f.severity === 'info').length,
      tokens: result.tokensUsed,
    },
  };
}

export function toJSON(result: ReviewResult, pretty = false): string {
  const output = formatForAgent(result);
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}
