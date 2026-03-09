#!/bin/bash
# Generate state.json and push to GitHub if changed
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Generate fresh state
python3 scripts/gen_state.py

# Check if state.json actually changed
if git diff --quiet state.json 2>/dev/null; then
    echo "No changes to state.json, skipping push"
    exit 0
fi

# Commit and push
git add state.json
git commit -m "state: update dashboard $(date -u +%Y-%m-%dT%H:%M:%SZ)" --quiet
git push --quiet 2>&1

echo "Pushed updated state.json"
