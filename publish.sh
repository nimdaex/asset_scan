#!/usr/bin/env bash
# Publish asset_scan/ as committed at H-Project HEAD to the public repo, as one snapshot commit.
# Authored with the GitHub noreply address so the private commit email stays out of the public history.
# The push triggers .github/workflows/deploy.yml there → GitHub Pages.
#   usage: asset_scan/publish.sh ["commit message"]
set -euo pipefail
REMOTE=https://github.com/nimdaex/asset_scan.git
NAME=nimdaex
EMAIL=13013217+nimdaex@users.noreply.github.com

cd "$(git rev-parse --show-toplevel)"
TREE=$(git rev-parse HEAD:asset_scan)
MSG=${1:-"Update from H-Project $(git rev-parse --short HEAD)"}
MSG="$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

PARENT=$(git ls-remote "$REMOTE" refs/heads/main | cut -f1)
ARGS=()
if [ -n "$PARENT" ]; then
  git fetch -q "$REMOTE" main
  ARGS=(-p "$PARENT")
fi
COMMIT=$(GIT_AUTHOR_NAME=$NAME GIT_AUTHOR_EMAIL=$EMAIL GIT_COMMITTER_NAME=$NAME GIT_COMMITTER_EMAIL=$EMAIL \
  git commit-tree "$TREE" "${ARGS[@]}" -m "$MSG")
git push "$REMOTE" "$COMMIT:refs/heads/main"
echo "published $COMMIT"
