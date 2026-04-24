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

export interface AgentSectionConfig {
  enabled: boolean;
  collapse: 'auto' | 'always' | 'never';
}

export interface AgentVerdictConfig {
  label: string;
}

export interface AgentOutput {
  verdict: 'approve' | 'changes_needed' | 'hold';
  summary: string;
  findings: AgentFinding[];
  sectionSummaries?: AgentSectionSummaries;
  sections?: {
    must_fix: AgentSectionConfig;
    should_fix: AgentSectionConfig;
    suggestions: AgentSectionConfig;
    questions: AgentSectionConfig;
  };
  verdicts?: {
    approve: AgentVerdictConfig;
    changes_needed: AgentVerdictConfig;
    hold: AgentVerdictConfig;
  };
  timezone?: string;
  stats: {
    critical: number;
    warnings: number;
    suggestions: number;
    tokens: number;
  };
  disciplineWarnings?: string[];
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

  const output: AgentOutput = {
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

  if (config) {
    output.sections = {
      must_fix: { enabled: config.sections.must_fix.enabled, collapse: config.sections.must_fix.collapse },
      should_fix: { enabled: config.sections.should_fix.enabled, collapse: config.sections.should_fix.collapse },
      suggestions: { enabled: config.sections.suggestions.enabled, collapse: config.sections.suggestions.collapse },
      questions: { enabled: config.sections.questions.enabled, collapse: config.sections.questions.collapse },
    };
    output.verdicts = {
      approve: { label: config.verdicts.approve.label },
      changes_needed: { label: config.verdicts.changes_needed.label },
      hold: { label: config.verdicts.hold.label },
    };
    output.timezone = config.timezone;
  }

  if (result.disciplineWarnings) {
    output.disciplineWarnings = result.disciplineWarnings;
  }

  return output;
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
