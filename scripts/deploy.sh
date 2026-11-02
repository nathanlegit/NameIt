#!/usr/bin/env bash
# Deploys the live demo to Vercel from this machine.
#
# The demo videos and frames (public/demo) are third-party footage, so they are
# never in git. Vercel's GitHub integration can't see them; instead we build
# here and upload the finished site (`vercel deploy --prebuilt`).
#
# First time: pnpm dlx vercel@64.5.0 login
# Usage:      pnpm deploy-demo            (production)
#             pnpm deploy-demo --preview  (a preview URL instead)

set -euo pipefail
# Personal scope (not the impactnet team), decided 2 Nov.
VERCEL="pnpm dlx vercel@64.5.0 --scope nathanlegits-projects"
TARGET="--prod"
if [[ "${1:-}" == "--preview" ]]; then TARGET=""; fi

# 1. Fresh demo data from the pipeline outputs (and the latest eval).
pnpm export-demo

# 2. Link this folder to a Vercel project (asks once, then remembers in .vercel/).
if [[ ! -f .vercel/project.json ]]; then
  $VERCEL link --yes --project name-it
fi
$VERCEL pull --yes --environment="$([[ -n "$TARGET" ]] && echo production || echo preview)"

# Vercel's Next.js builder lists every .env file in the project root inside the
# server functions. .env.local holds the pipeline's API keys, which the web app
# never needs, so it is moved out of the folder for the build and upload, and
# always moved back (even if a step fails).
ENV_STASH=""
if [[ -f .env.local ]]; then
  ENV_STASH="$(mktemp -d)"
  mv .env.local "$ENV_STASH/.env.local"
fi
restore_env() {
  if [[ -n "$ENV_STASH" && -f "$ENV_STASH/.env.local" ]]; then
    mv "$ENV_STASH/.env.local" .env.local
    rmdir "$ENV_STASH"
  fi
}
trap restore_env EXIT

# 3. Build locally in demo mode: reviews are kept in the browser, not saved on the server.
rm -rf .vercel/output
NAME_IT_DEMO_MODE=1 $VERCEL build $TARGET
if grep -rq '"\.env\.local"' .vercel/output/functions 2>/dev/null; then
  echo "Refusing to deploy: the build output still references .env.local." >&2
  exit 1
fi

# 4. Upload the built site, including public/demo.
$VERCEL deploy --prebuilt $TARGET
