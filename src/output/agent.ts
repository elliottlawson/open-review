/**
 * Agent Output Formatter
 * 
 * Token-efficient JSON output for consumption by other agents.
 */

import type { ReviewResult } from '../core/types.js';

export interface AgentOutput {
  verdict: 'approve' | 'request_changes' | 'comment';
  summary: string;
  findings: AgentFinding[];
  stats: {
    critical: number;
    warnings: number;
    suggestions: number;
    tokens: number;
  };
}

export interface AgentFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  file?: string;
  line?: number;
  message: string;
  fix?: string;
}

export function formatForAgent(result: ReviewResult): AgentOutput {
  const findings: AgentFinding[] = result.findings
    .filter(f => f.type !== 'praise') // Agents don't need praise
    .map(f => ({
      severity: f.severity,
      category: f.category,
      file: f.file,
      line: f.line,
      message: `${f.title}: ${f.description}`,
      fix: f.suggestedFix,
    }));

  return {
    verdict: result.recommendation,
    summary: result.summary,
    findings,
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
