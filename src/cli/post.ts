/**
 * Post Command
 * 
 * Posts review results to a GitHub PR as comments.
 */

import { readFileSync } from 'fs';
import { Octokit } from '@octokit/rest';
import type { ReviewResult, ReviewFinding } from '../core/types.js';
import type { AgentOutput, AgentFinding } from '../output/agent.js';

// ============================================================================
// Types
// ============================================================================

export interface PostArgs {
  /** Repository in owner/repo format */
  repo: string;
  /** PR number */
  pr: number;
  /** Review result (JSON string, object, or file path) */
  result: ReviewResult | AgentOutput | string;
  /** Path to JSON file with results */
  resultFile?: string;
  /** GitHub token (defaults to GITHUB_TOKEN env) */
  token?: string;
  /** Dry run - don't actually post */
  dryRun?: boolean;
}

// Normalized result for posting
interface NormalizedResult {
  verdict: 'approve' | 'request_changes' | 'comment';
  summary: string;
  findings: NormalizedFinding[];
  tokensUsed: number;
}

interface NormalizedFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
  type?: string;
}

function normalizeResult(input: ReviewResult | AgentOutput): NormalizedResult {
  // Check if it's AgentOutput format (has 'verdict') or ReviewResult (has 'recommendation')
  if ('verdict' in input && 'stats' in input) {
    // AgentOutput format
    const agentOutput = input as AgentOutput;
    return {
      verdict: agentOutput.verdict,
      summary: agentOutput.summary,
      findings: agentOutput.findings.map(f => ({
        severity: f.severity,
        category: f.category,
        title: f.message.split(':')[0] || f.message,
        description: f.message.split(':').slice(1).join(':').trim() || f.message,
        file: f.file,
        line: f.line,
        suggestedFix: f.fix,
      })),
      tokensUsed: agentOutput.stats.tokens,
    };
  } else {
    // ReviewResult format
    const reviewResult = input as ReviewResult;
    return {
      verdict: reviewResult.recommendation,
      summary: reviewResult.summary,
      findings: reviewResult.findings.map(f => ({
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        file: f.file,
        line: f.line,
        suggestedFix: f.suggestedFix,
        type: f.type,
      })),
      tokensUsed: reviewResult.tokensUsed,
    };
  }
}

// ============================================================================
// Formatting
// ============================================================================

function severityEmoji(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    case 'info': return '🔵';
    default: return '⚪';
  }
}

function verdictEmoji(verdict: string): string {
  switch (verdict) {
    case 'approve': return '✅';
    case 'request_changes': return '❌';
    case 'comment': return '💬';
    default: return '📝';
  }
}

function formatFindingForGitHub(finding: NormalizedFinding): string {
  const location = finding.file 
    ? finding.line 
      ? `\`${finding.file}:${finding.line}\``
      : `\`${finding.file}\``
    : '';
  
  let content = `${severityEmoji(finding.severity)} **${finding.title}**`;
  if (location) content += ` — ${location}`;
  content += `\n\n${finding.description}`;
  
  if (finding.suggestedFix) {
    content += `\n\n<details>\n<summary>Suggested fix</summary>\n\n\`\`\`\n${finding.suggestedFix}\n\`\`\`\n</details>`;
  }
  
  return content;
}

function formatReviewComment(result: NormalizedResult): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`## ${verdictEmoji(result.verdict)} Open Review`);
  lines.push('');
  
  // Summary
  lines.push(`**Verdict:** ${result.verdict.replace('_', ' ').toUpperCase()}`);
  lines.push('');
  lines.push(result.summary);
  lines.push('');
  
  // Group findings by severity
  const critical = result.findings.filter(f => f.severity === 'critical');
  const warnings = result.findings.filter(f => f.severity === 'warning');
  const suggestions = result.findings.filter(f => f.severity === 'info');
  const praise = result.findings.filter(f => f.type === 'praise');
  
  if (critical.length > 0) {
    lines.push(`### 🔴 Critical Issues (${critical.length})`);
    lines.push('');
    for (const finding of critical) {
      lines.push(formatFindingForGitHub(finding));
      lines.push('');
    }
  }
  
  if (warnings.length > 0) {
    lines.push(`### 🟡 Warnings (${warnings.length})`);
    lines.push('');
    for (const finding of warnings) {
      lines.push(formatFindingForGitHub(finding));
      lines.push('');
    }
  }
  
  if (suggestions.length > 0) {
    lines.push(`### 🔵 Suggestions (${suggestions.length})`);
    lines.push('');
    for (const finding of suggestions) {
      lines.push(formatFindingForGitHub(finding));
      lines.push('');
    }
  }
  
  if (praise.length > 0) {
    lines.push(`### ✅ Good Stuff (${praise.length})`);
    lines.push('');
    for (const finding of praise) {
      lines.push(`- **${finding.title}**: ${finding.description}`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push('---');
  lines.push(`*Reviewed by [Open Review](https://github.com/elliottlawson/open-review)*`);
  
  return lines.join('\n');
}

// ============================================================================
// GitHub API
// ============================================================================

type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

function verdictToEvent(verdict: string): ReviewEvent {
  switch (verdict) {
    case 'approve': return 'APPROVE';
    case 'request_changes': return 'REQUEST_CHANGES';
    default: return 'COMMENT';
  }
}

async function postReviewToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  result: NormalizedResult
): Promise<{ reviewId: number; commentId?: number }> {
  const body = formatReviewComment(result);
  const event = verdictToEvent(result.verdict);
  
  // Post as a PR review
  const review = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    body,
    event,
  });
  
  return { reviewId: review.data.id };
}

// ============================================================================
// CLI Handler
// ============================================================================

export function parsePostArgs(args: string[]): PostArgs {
  const result: PostArgs = {
    repo: '',
    pr: 0,
    result: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--repo' || arg === '-r') {
      result.repo = args[++i];
    } else if (arg === '--pr' || arg === '-p') {
      result.pr = parseInt(args[++i], 10);
    } else if (arg === '--result') {
      result.result = args[++i];
    } else if (arg === '--result-file' || arg === '-f') {
      result.resultFile = args[++i];
    } else if (arg === '--token' || arg === '-t') {
      result.token = args[++i];
    } else if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    }
  }

  return result;
}

export async function handlePost(args: PostArgs): Promise<void> {
  // Validate inputs
  if (!args.repo) {
    console.error('Error: --repo is required (format: owner/repo)');
    process.exit(1);
  }
  
  if (!args.pr) {
    console.error('Error: --pr is required');
    process.exit(1);
  }
  
  if (!args.result && !args.resultFile) {
    console.error('Error: --result or --result-file is required');
    process.exit(1);
  }
  
  const token = args.token || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GitHub token required (--token or GITHUB_TOKEN env)');
    process.exit(1);
  }
  
  // Parse repo
  const [owner, repo] = args.repo.split('/');
  if (!owner || !repo) {
    console.error('Error: Invalid repo format. Expected: owner/repo');
    process.exit(1);
  }
  
  // Parse result
  let rawResult: ReviewResult | AgentOutput;
  if (args.resultFile) {
    try {
      const content = readFileSync(args.resultFile, 'utf-8');
      rawResult = JSON.parse(content);
    } catch (e) {
      console.error(`Error: Failed to read/parse --result-file: ${(e as Error).message}`);
      process.exit(1);
    }
  } else if (typeof args.result === 'string') {
    try {
      rawResult = JSON.parse(args.result);
    } catch (e) {
      console.error('Error: Invalid JSON in --result');
      process.exit(1);
    }
  } else {
    rawResult = args.result as ReviewResult | AgentOutput;
  }
  
  // Normalize to common format
  const result = normalizeResult(rawResult);
  
  // Format comment
  const comment = formatReviewComment(result);
  
  if (args.dryRun) {
    console.log('--- Dry Run: Would post this review ---');
    console.log(`Repository: ${owner}/${repo}`);
    console.log(`PR: #${args.pr}`);
    console.log(`Event: ${verdictToEvent(result.verdict)}`);
    console.log('');
    console.log(comment);
    console.log('--- End Dry Run ---');
    return;
  }
  
  // Post to GitHub
  const octokit = new Octokit({ auth: token });
  
  try {
    const { reviewId } = await postReviewToGitHub(octokit, owner, repo, args.pr, result);
    console.log(`Review posted: https://github.com/${owner}/${repo}/pull/${args.pr}#pullrequestreview-${reviewId}`);
  } catch (error) {
    console.error(`Error posting review: ${(error as Error).message}`);
    process.exit(1);
  }
}
