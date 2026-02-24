#!/bin/bash
# Install the solana-wallet-dev skill for Claude Code
#
# Usage:
#   bash install.sh
#   # or
#   curl -sL https://raw.githubusercontent.com/YOUR_REPO/main/solana-wallet-skill/install.sh | bash

set -e

SKILL_NAME="solana-wallet-dev"
SKILL_DIR="$HOME/.claude/skills/$SKILL_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Claude Code skill: $SKILL_NAME"

# Create skill directory
mkdir -p "$SKILL_DIR/topics"

# Copy SKILL.md
cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"

# Copy topic files
for topic in "$SCRIPT_DIR/topics/"*.md; do
  if [ -f "$topic" ]; then
    cp "$topic" "$SKILL_DIR/topics/$(basename "$topic")"
  fi
done

echo ""
echo "Installed to: $SKILL_DIR"
echo ""
echo "Files:"
find "$SKILL_DIR" -type f | sort | while read -r f; do
  echo "  $f"
done
echo ""
echo "The skill is now available in all Claude Code sessions."
echo "It will automatically activate when you work on Solana wallet projects."
