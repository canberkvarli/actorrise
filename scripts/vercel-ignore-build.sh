#!/bin/bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 skips the build, exit 1 builds.
#
# Why (2026-11-12): 100 builds in 6.6 days, 68 of them previews of branches
# nobody opens (content-engine, claude/*), and the 32 production ones each
# threw away the ISR cache, so crawlers re-rendered the ~20k monologue pages
# after every deploy: 691K ISR writes against the Hobby cap of 200K, 56 GB of
# deployment storage against 10 GB, 21 h of build time. Canberk pushes to
# main and never uses previews, and most pushes only touch the backend
# (Render deploys that on its own).

set -u
ref="${VERCEL_GIT_COMMIT_REF:-}"
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ "$ref" != "main" ]; then
  echo "Skipping: branch '$ref' is not main (no preview builds)."
  exit 0
fi

# No earlier deployment to compare with, or it is not in this clone: build.
if [ -z "$prev" ] || ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "Building: no previous deployment commit to compare with."
  exit 1
fi

# Anything the site does not read. Everything else, data/ and public/
# included, still builds.
if git diff --quiet "$prev" HEAD -- . \
  ':(exclude)backend' \
  ':(exclude)apps' \
  ':(exclude).easignore' \
  ':(exclude)docs' \
  ':(exclude)outputs' \
  ':(exclude)outreach' \
  ':(exclude).claude' \
  ':(exclude)*.md'; then
  echo "Skipping: nothing the site uses changed since $prev."
  exit 0
fi

# At most one production build a day (2026-11-25, back to Hobby). Every build
# throws the ISR cache away and crawlers re-render the monologue pages, and on
# Pro 11-21 to 11-24 that ran at about 8,500 ISR writes a day, some 255K a
# month against Hobby's 200K: 48 site builds from 11-04 to 11-25 were the
# reason. Site changes pushed within a day of the last build wait for the next
# push after it. "[deploy]" in the commit message builds now, for a fix.
msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
case "$msg" in
  *"[deploy]"*)
    echo "Building: [deploy] in the commit message."
    exit 1
    ;;
esac
prev_at=$(git log -1 --format=%ct "$prev" 2>/dev/null || echo 0)
age=$(( $(date +%s) - prev_at ))
if [ "$age" -lt 86400 ]; then
  echo "Skipping: the last build ($prev) is $((age / 3600))h old; site changes wait for the daily build. Add [deploy] to build now."
  exit 0
fi

echo "Building: site files changed since $prev."
exit 1
