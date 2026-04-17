#!/bin/bash
# Run reviews on all open PRs in parallel

set -e

REPO="elliottlawson/open-review-laravel-testbed"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure we're built
echo "🔨 Building..."
cd "$PROJECT_DIR"
npm run build --silent

# Get all open PRs
echo "📋 Getting open PRs..."
PRS=$(gh pr list --repo "$REPO" --state open --json number --jq '.[].number')

if [ -z "$PRS" ]; then
  echo "No open PRs found. Run ./scripts/reset-test-prs.sh first."
  exit 1
fi

# Run reviews in parallel
echo "🚀 Starting reviews..."
mkdir -p /tmp/open-review-logs

for pr in $PRS; do
  echo "   PR #$pr starting..."
  open-review pr "$REPO#$pr" --verbose 2>&1 > "/tmp/open-review-logs/pr-$pr.log" &
done

echo "⏳ Waiting for all reviews to complete..."
wait

echo ""
echo "📊 Results:"
echo "==========="

for pr in $PRS; do
  RESULT=$(grep -E "^Recommendation:" "/tmp/open-review-logs/pr-$pr.log" 2>/dev/null | cut -d' ' -f2)
  FINDINGS=$(grep -E "^Findings:" "/tmp/open-review-logs/pr-$pr.log" 2>/dev/null | cut -d' ' -f2)
  TITLE=$(gh pr view "$pr" --repo "$REPO" --json title --jq '.title')
  
  case "$RESULT" in
    APPROVE) ICON="✅" ;;
    REQUEST_CHANGES) ICON="🔄" ;;
    COMMENT) ICON="💬" ;;
    *) ICON="❓" ;;
  esac
  
  echo "$ICON PR #$pr: $TITLE"
  echo "   Verdict: $RESULT | Findings: $FINDINGS"
  echo "   https://github.com/$REPO/pull/$pr"
  echo ""
done

echo "📁 Full logs in /tmp/open-review-logs/"
