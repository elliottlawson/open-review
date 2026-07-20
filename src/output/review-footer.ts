import type { ReviewRunContext } from '../core/types.js';

function formatReviewTimestamp(
  reviewedAt: Date,
  timezone?: string
): string {
  return reviewedAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || 'America/New_York',
  });
}

function formatCommitForMarkdown(commit: NonNullable<ReviewRunContext['commit']>): string {
  if (commit.url) {
    return `[${commit.shortSha}](${commit.url})`;
  }
  return `\`${commit.shortSha}\``;
}

export function formatReviewFooterMarkdown(
  context?: ReviewRunContext,
  timezone?: string
): string | null {
  if (!context?.commit) {
    return null;
  }

  const parts: string[] = [];
  if (context.version !== undefined) {
    parts.push(`**v${context.version}**`);
  }
  parts.push(formatCommitForMarkdown(context.commit));
  parts.push(formatReviewTimestamp(
    context.reviewedAt ? new Date(context.reviewedAt) : new Date(),
    timezone
  ));

  return parts.join(' · ');
}

export function formatReviewFooterHuman(
  context?: ReviewRunContext,
  timezone?: string
): string | null {
  if (!context?.commit) {
    return null;
  }

  const parts: string[] = [];
  if (context.version !== undefined) {
    parts.push(`v${context.version}`);
  }
  parts.push(context.commit.shortSha);
  parts.push(formatReviewTimestamp(
    context.reviewedAt ? new Date(context.reviewedAt) : new Date(),
    timezone
  ));

  return parts.join(' · ');
}
