#!/usr/bin/env bash
# Fails if anything secret-shaped reached the client bundle. PLAN.md §13.4.
#
# This looks for secret *values* and for the names of server-only environment
# variables. It deliberately does not grep for the bare words "secret" or
# "password": minified framework code is full of them as property names
# (`url.password` is standard WHATWG URL API), and a check that cries wolf on
# every build is a check people learn to ignore.
#
# Run after `pnpm build`. Add to DENY_ENV as new server-only variables appear.
set -euo pipefail

DIR="${1:-.next/static}"

# Values: well-known credential formats.
VALUE_PATTERNS='-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b'

# Names: server-only variables. Nothing here is NEXT_PUBLIC_, so any occurrence
# in client output means a server module was pulled into the browser graph.
DENY_ENV='UPSTASH_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_URL'

if [ ! -d "$DIR" ]; then
  echo "error: $DIR does not exist — run 'pnpm build' first" >&2
  exit 1
fi

found=0
if grep -rIlE -e "$VALUE_PATTERNS" "$DIR"; then
  echo "error: credential-shaped value found in $DIR" >&2
  found=1
fi
if grep -rIlE -e "$DENY_ENV" "$DIR"; then
  echo "error: server-only environment variable name found in $DIR" >&2
  found=1
fi

[ "$found" -eq 0 ] || exit 1
echo "$DIR: clean"
