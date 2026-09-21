#!/usr/bin/env bash
# Drain the global challenge pool once: POST /api/internal/challenge-pool/sweep.
#
# Run by challenge-pool-sweep.timer on the app VPS (every ~3 minutes). NOT
# installed by anything in this repo — see the install notes below.
#
# Reads two variables, normally from /etc/nano-syllabus/challenge-pool-sweep.env
# (root:root, mode 0600):
#
#   CHALLENGE_POOL_SWEEP_URL=https://<app host>/api/internal/challenge-pool/sweep
#   CHALLENGE_POOL_SWEEP_SECRET=<same value as the app's CHALLENGE_POOL_SWEEP_SECRET>
#
# The secret is handed to curl on stdin (-K -), never on its command line, so it
# does not show up in `ps`.
#
# Install (by hand, when the migration, the backend prepare route and the app's
# CHALLENGE_POOL_SWEEP_SECRET are all live):
#
#   sudo install -m 0755 scripts/ops/challenge-pool-sweep.sh /usr/local/bin/challenge-pool-sweep
#   sudo install -m 0644 scripts/ops/challenge-pool-sweep.service /etc/systemd/system/
#   sudo install -m 0644 scripts/ops/challenge-pool-sweep.timer /etc/systemd/system/
#   sudo install -d -m 0755 /etc/nano-syllabus
#   sudo install -m 0600 /dev/null /etc/nano-syllabus/challenge-pool-sweep.env   # then edit it
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now challenge-pool-sweep.timer
#
# Watch it:   journalctl -u challenge-pool-sweep.service -f
# One run:    sudo systemctl start challenge-pool-sweep.service
set -euo pipefail

: "${CHALLENGE_POOL_SWEEP_URL:?set CHALLENGE_POOL_SWEEP_URL}"
: "${CHALLENGE_POOL_SWEEP_SECRET:?set CHALLENGE_POOL_SWEEP_SECRET}"

# The route runs for up to 300s (maxDuration); give it a little more.
printf 'header = "Authorization: Bearer %s"\n' "$CHALLENGE_POOL_SWEEP_SECRET" |
  curl --silent --show-error --fail-with-body \
    --max-time 320 \
    --request POST \
    --header "Accept: application/json" \
    --config - \
    "$CHALLENGE_POOL_SWEEP_URL"
echo
