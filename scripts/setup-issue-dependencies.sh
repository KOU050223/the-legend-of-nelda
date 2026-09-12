#!/usr/bin/env bash
set -euo pipefail

REPO="KOU050223/the-legend-of-nelda"

# Native GitHub Issue Dependencies for Phase 1.
#
# This script mirrors the `Blocked by:` relationships written in the issue bodies
# and registers them as GitHub's actual Issue Dependencies.
#
# It is safe to re-run: existing relationships are detected and skipped.
#
# Requirements:
#   - GitHub CLI (`gh`) installed
#   - Authenticated with permission to edit issues in this repository
#   - A recent gh version that supports `--add-blocked-by`
#
# Run from anywhere:
#   bash scripts/setup-issue-dependencies.sh

command -v gh >/dev/null 2>&1 || {
  echo "ERROR: GitHub CLI (gh) is not installed."
  echo "Install it from https://cli.github.com/ and try again."
  exit 1
}

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated."
  echo "Run: gh auth login"
  exit 1
fi

if ! gh issue edit --help 2>&1 | grep -q -- '--add-blocked-by'; then
  echo "ERROR: Your GitHub CLI does not support native issue dependencies."
  echo "Update gh to a recent version and try again."
  exit 1
fi

add_dependency() {
  issue="$1"
  blocker="$2"

  if gh issue view "$issue" --repo "$REPO" --json blockedBy \
      --jq '.blockedBy[].number' 2>/dev/null | grep -qx "$blocker"; then
    echo "SKIP  #$issue is already blocked by #$blocker"
    return 0
  fi

  echo "ADD   #$issue blocked by #$blocker"
  gh issue edit "$issue" \
    --repo "$REPO" \
    --add-blocked-by "$blocker" \
    >/dev/null
}

# -----------------------------------------------------------------------------
# Phase 1 dependency graph
# -----------------------------------------------------------------------------
#
# #13 Project setup
#   ↓
# #15 Test / CI foundation
#   ↓
# #2 Combat state machine
#   ├─ #3 Player input
#   ├─ #4 Common boss attack foundation
#   └─ #5 HP / SLEEPINESS / damage
#          ↓
#      #6 / #7 / #8 Boss attacks
#          ↓
#      #9 / #10 / #11 / #12
#          ↓
#         #14 Final playtest / tuning
#
# Parent/child relation with #1 is intentionally NOT expressed as blocking.
# #1 is the Phase 1 tracking/parent issue, not a prerequisite implementation.

# #15: Test / CI foundation
add_dependency 15 13

# #2: Combat state machine
# Keep both because the issue body currently declares both as hard blockers.
add_dependency 2 13
add_dependency 2 15

# #3-#5: Common combat foundations
add_dependency 3 2
add_dependency 4 2
add_dependency 5 2

# #6-#8: Boss attacks
for issue in 6 7 8; do
  add_dependency "$issue" 3
  add_dependency "$issue" 4
  add_dependency "$issue" 5
done

# #9: HUD / event UI
add_dependency 9 5

# #10: Tutorial / battle sequence
for blocker in 2 3 6 7 8 9; do
  add_dependency 10 "$blocker"
done

# #11: SE / VFX / hit feedback
for blocker in 4 6 7 8; do
  add_dependency 11 "$blocker"
done

# #12: Victory / defeat / finish presentation
for blocker in 2 5 8 10; do
  add_dependency 12 "$blocker"
done

# #14: Final integrated playtest / balancing
for blocker in 6 7 8 9 10 11 12; do
  add_dependency 14 "$blocker"
done

echo
echo "Done. Current dependency summary:"
for issue in 2 3 4 5 6 7 8 9 10 11 12 14 15; do
  echo
  gh issue view "$issue" --repo "$REPO" --json number,title,blockedBy \
    --jq '"#\(.number) \(.title)\n  Blocked by: " + ((.blockedBy | map("#" + (.number|tostring)) | join(", ")) // "")'
done
