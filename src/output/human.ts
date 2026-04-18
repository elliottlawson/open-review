/**
 * Human Output Formatter
 * 
 * Terminal-friendly output that mirrors GitHub review style.
 */

import type { ReviewResult, ReviewFinding } from '../core/types.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return c('red', '●');
    case 'warning': return c('yellow', '●');
    case 'info': return c('blue', '○');
    default: return '○';
  }
}

function verdictBadge(verdict: string): string {
  switch (verdict) {
    case 'approve':
      return c('green', c('bold', '✓ APPROVE'));
    case 'request_changes':
      return c('red', c('bold', '✗ REQUEST CHANGES'));
    case 'comment':
      return c('yellow', c('bold', '◆ COMMENT'));
    default:
      return verdict;
  }
}

function formatLocation(finding: ReviewFinding): string {
  if (finding.file && finding.line) {
    return c('cyan', `${finding.file}:${finding.line}`);
  } else if (finding.file) {
    return c('cyan', finding.file);
  }
  return '';
}

function formatFinding(finding: ReviewFinding): string {
  const lines: string[] = [];
  
  const location = formatLocation(finding);
  const header = location 
    ? `${severityIcon(finding.severity)} ${c('bold', finding.title)} ${c('dim', `(${finding.category})`)} — ${location}`
    : `${severityIcon(finding.severity)} ${c('bold', finding.title)} ${c('dim', `(${finding.category})`)}`;
  
  lines.push(header);
  lines.push(`  ${finding.description}`);
  
  if (finding.suggestedFix) {
    lines.push('');
    lines.push(c('dim', '  ┌─ Suggested fix ─────────────────────────────────'));
    const fixLines = finding.suggestedFix.split('\n');
    for (const line of fixLines) {
      lines.push(c('dim', '  │ ') + c('green', line));
    }
    lines.push(c('dim', '  └─────────────────────────────────────────────────'));
  }
  
  return lines.join('\n');
}

function groupByType(findings: ReviewFinding[]): Map<string, ReviewFinding[]> {
  const groups = new Map<string, ReviewFinding[]>();
  
  for (const finding of findings) {
    const key = finding.type === 'praise' ? 'praise' : finding.severity;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(finding);
  }
  
  return groups;
}

export function formatForHuman(result: ReviewResult): string {
  const lines: string[] = [];
  
  // Header
  lines.push('');
  lines.push(c('bold', '═══════════════════════════════════════════════════════════════'));
  lines.push(c('bold', '                        CODE REVIEW'));
  lines.push(c('bold', '═══════════════════════════════════════════════════════════════'));
  lines.push('');
  
  // Verdict
  lines.push(`  Verdict: ${verdictBadge(result.recommendation)}`);
  lines.push('');
  
  // Summary
  lines.push(c('bold', '  Summary'));
  lines.push(c('dim', '  ───────'));
  const summaryLines = result.summary.split('\n');
  for (const line of summaryLines) {
    lines.push(`  ${line}`);
  }
  lines.push('');
  
  // Group findings
  const groups = groupByType(result.findings);
  
  // Critical issues
  const critical = groups.get('critical') || [];
  if (critical.length > 0) {
    lines.push(c('red', c('bold', `  Critical Issues (${critical.length})`)));
    lines.push(c('dim', '  ─────────────────'));
    for (const finding of critical) {
      lines.push('');
      lines.push(formatFinding(finding));
    }
    lines.push('');
  }
  
  // Warnings
  const warnings = groups.get('warning') || [];
  if (warnings.length > 0) {
    lines.push(c('yellow', c('bold', `  Warnings (${warnings.length})`)));
    lines.push(c('dim', '  ────────'));
    for (const finding of warnings) {
      lines.push('');
      lines.push(formatFinding(finding));
    }
    lines.push('');
  }
  
  // Suggestions
  const suggestions = groups.get('info') || [];
  if (suggestions.length > 0) {
    lines.push(c('blue', c('bold', `  Suggestions (${suggestions.length})`)));
    lines.push(c('dim', '  ───────────'));
    for (const finding of suggestions) {
      lines.push('');
      lines.push(formatFinding(finding));
    }
    lines.push('');
  }
  
  // Praise
  const praise = groups.get('praise') || [];
  if (praise.length > 0) {
    lines.push(c('green', c('bold', `  Good Stuff (${praise.length})`)));
    lines.push(c('dim', '  ──────────'));
    for (const finding of praise) {
      lines.push('');
      lines.push(`  ${c('green', '✓')} ${c('bold', finding.title)}`);
      lines.push(`    ${finding.description}`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push(c('dim', '───────────────────────────────────────────────────────────────'));
  lines.push(c('dim', `  Tokens used: ${result.tokensUsed.toLocaleString()}`));
  lines.push('');
  
  return lines.join('\n');
}
