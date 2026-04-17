#!/bin/bash
# Reset Test PRs
# Closes all open PRs and creates fresh ones from existing branches

set -e

REPO="elliottlawson/open-review-laravel-testbed"

# Test scenarios - branch:title:body
SCENARIOS=(
  "feat/order-system:feat: add order management system:Adds order management with intentional issues for testing."
  "feat/clean-helper:feat: add StringHelper utility class:Clean helper with one hidden security issue (hardcoded secret)."
  "feat/large-pr:feat: add 120 generated helper files:Testing large PR handling (100+ files)."
  "feat/binary-files:feat: add logo image and helper:Testing binary file handling."
  "feat/deletions-only:chore: remove unused User model:Testing deletion-only PRs."
  "feat/renames-only:refactor: rename AppServiceProvider:Testing rename-only PRs (file renamed but class name not updated - real bug)."
  "feat/empty-description:feat: add MathHelper:"
)

echo "🧹 Closing all open PRs..."
OPEN_PRS=$(gh pr list --repo "$REPO" --state open --json number --jq '.[].number')
for pr in $OPEN_PRS; do
  echo "   Closing PR #$pr"
  gh pr close "$pr" --repo "$REPO" --delete-branch=false 2>/dev/null || true
done

echo ""
echo "🔄 Creating fresh PRs..."
for scenario in "${SCENARIOS[@]}"; do
  IFS=':' read -r branch title body <<< "$scenario"
  
  # Check if branch exists
  if ! gh api "repos/$REPO/branches/$branch" &>/dev/null; then
    echo "   ⚠️  Branch $branch not found, skipping"
    continue
  fi
  
  echo "   Creating: $title"
  if [ -z "$body" ]; then
    # Empty body scenario
    gh pr create --repo "$REPO" --head "$branch" --base main --title "$title" --body "" 2>/dev/null || echo "      (may already exist)"
  else
    gh pr create --repo "$REPO" --head "$branch" --base main --title "$title" --body "$body" 2>/dev/null || echo "      (may already exist)"
  fi
done

echo ""
echo "📋 Current PRs:"
gh pr list --repo "$REPO" --state open

echo ""
echo "✅ Done! Run reviews with:"
echo "   ./scripts/run-all-reviews.sh"
