#!/usr/bin/env bash
set -euo pipefail
: "${INDEXING_SWEEP_URL:?set INDEXING_SWEEP_URL}"
: "${INDEXING_SWEEP_SECRET:?set INDEXING_SWEEP_SECRET}"
printf 'header = "Authorization: Bearer %s"\n' "$INDEXING_SWEEP_SECRET" |
  curl --silent --show-error --fail-with-body --max-time 310 --request POST \
    --header 'Accept: application/json' --config - "$INDEXING_SWEEP_URL"
