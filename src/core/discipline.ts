/**
 * Output Discipline Validator
 *
 * Lightweight heuristics to catch violations of output discipline rules.
 * Non-blocking — logs warnings. Future work may re-run on major violations.
 */

import type { ReviewResult } from './types.js';

export interface DisciplineReport {
  warnings: string[];
  severity: 'ok' | 'minor' | 'major';
}

/**
 * Checks if text contains verdict-related labels or emojis that would
 * duplicate the template layer's rendered header.
 */
function containsVerdictLabel(summary: string): boolean {
  const patterns = [
    /✅/,
    /🔄/,
    /🤔/,
    /LGTM/i,
    /approve/i,
    /changes needed/i,
    /changes requested/i,
    /hold/i,
    /do not merge/i,
    /let's discuss/i,
  ];
  return patterns.some((p) => p.test(summary));
}

/**
 * Checks if findings contain probable duplicates (same title/category/file prefix).
 */
function hasDuplicateFindings(result: ReviewResult): boolean {
  const seen = new Set<string>();
  for (const f of result.findings) {
    const key = `${f.category}:${f.title}:${f.file ?? ''}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function validateDiscipline(result: ReviewResult): DisciplineReport {
  const warnings: string[] = [];
  let hasMajor = false;

  // Major: approve with findings
  if (result.recommendation === 'approve' && result.findings.length > 0) {
    warnings.push(
      `Verdict is 'approve' but ${result.findings.length} finding(s) exist. Use 'changes_needed' when there are real issues.`
    );
    hasMajor = true;
  }

  // Minor: approve with long summary
  if (
    result.recommendation === 'approve' &&
    result.summary.trim().length > 120
  ) {
    warnings.push(
      `Clean approval summary is ${result.summary.trim().length} chars. Keep to 1-2 sentences (max ~120 chars).`
    );
  }

  // Major: changes_needed or hold with no findings
  if (
    (result.recommendation === 'changes_needed' ||
      result.recommendation === 'hold') &&
    result.findings.length === 0
  ) {
    warnings.push(
      `Verdict is '${result.recommendation}' but no findings exist. Either find concrete issues or use 'approve'. Do not manufacture concerns.`
    );
    hasMajor = true;
  }

  // Minor: summary duplicates template verdict
  if (containsVerdictLabel(result.summary)) {
    warnings.push(
      `Summary contains verdict label or emoji (e.g., LGTM, ✅, 🔄). The template layer renders these. Keep the summary focused on the 'why'.`
    );
  }

  // Minor: probable duplicate findings
  if (hasDuplicateFindings(result)) {
    warnings.push(
      `Findings contain probable duplicates. If the same issue repeats across files, flag it once and note it applies broadly.`
    );
  }

  return {
    warnings,
    severity: hasMajor ? 'major' : warnings.length > 0 ? 'minor' : 'ok',
  };
}
