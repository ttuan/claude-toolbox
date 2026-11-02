#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Fetch the plan quota (5-hour and 7-day windows) at session start, so the
# status line can show it before the session's first API response.
#
# It sends one tiny headless request with no tools, no settings, no MCP and a
# one-line system prompt (about 560 input tokens, ~4 s) and keeps the
# rate-limit numbers Claude Code reports for it. The result goes to a cache
# file that statusline.sh reads until Claude Code sends real numbers.
#
# Run it from a SessionStart hook with --detach: it re-launches itself in the
# background and returns at once, so the session never waits on it.
#
#   quota-probe.sh --detach
#
# Multiple accounts: it calls plain `claude` with the environment it inherits,
# so a session started with CLAUDE_CONFIG_DIR=~/.claude-work probes that
# account. It never fills in CLAUDE_CONFIG_DIR itself: setting it to ~/.claude
# is NOT the same as leaving it unset (Claude Code then looks up a different
# login and reports "Not logged in").
#
# Needs: bash, jq, claude. Uses `timeout` or `gtimeout` when present.
# ─────────────────────────────────────────────────────────────

# Never probe from inside a probe.
[ -n "${CLAUDE_TOOLBOX_QUOTA_PROBE:-}" ] && exit 0

if [ "${1:-}" = "--detach" ]; then
  nohup "$0" </dev/null >/dev/null 2>&1 &
  exit 0
fi

command -v claude >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# An API-key session has no plan quota, and the probe would bill the key.
[ -n "${ANTHROPIC_API_KEY:-}${ANTHROPIC_AUTH_TOKEN:-}" ] && exit 0

# ─────────────────────────────────────────────────────────────
# Cache file, one per login. Keyed on the raw CLAUDE_CONFIG_DIR value, or
# "default" when it is unset; statusline.sh derives the same key.
# ─────────────────────────────────────────────────────────────
sha8() {
  if command -v shasum >/dev/null 2>&1; then printf '%s' "$1" | shasum -a 256 | cut -c1-8
  else printf '%s' "$1" | sha256sum | cut -c1-8
  fi
}
key=default
[ -n "${CLAUDE_CONFIG_DIR:-}" ] && key=$(sha8 "$CLAUDE_CONFIG_DIR")
cache_dir="${TMPDIR:-/tmp}"
cache_dir="${cache_dir%/}"
cache="$cache_dir/claude-toolbox-quota-$key.json"
lock="$cache.lock"

# Skip when another probe for this login is running, or one ran in the last
# minute (a burst of resumes should cost one request, not several).
age() { # seconds since a path was last modified
  local m
  m=$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0)
  echo $(( $(date +%s) - m ))
}
if ! mkdir "$lock" 2>/dev/null; then
  # A lock older than two minutes belongs to a probe that was killed.
  [ "$(age "$lock")" -lt 120 ] && exit 0
  rmdir "$lock" 2>/dev/null
  mkdir "$lock" 2>/dev/null || exit 0
fi
trap 'rmdir "$lock" 2>/dev/null' EXIT
[ -f "$cache" ] && [ "$(age "$cache")" -lt 60 ] && exit 0

# The account this login belongs to, so the status line can tell when the
# cache was written for someone else (after a /login in the same config dir).
config_json="${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/.claude.json}"
config_json="${config_json:-$HOME/.claude.json}"
org_uuid=$(jq -r '.oauthAccount.organizationUuid // ""' "$config_json" 2>/dev/null)

limit=""
if command -v timeout >/dev/null 2>&1; then limit="timeout 60"
elif command -v gtimeout >/dev/null 2>&1; then limit="gtimeout 60"
fi

# Run from a scratch dir so no project settings, hooks or CLAUDE.md load.
work=$(mktemp -d 2>/dev/null) || exit 0
trap 'rmdir "$lock" 2>/dev/null; rm -rf "$work"' EXIT

windows=$(
  cd "$work" &&
    CLAUDE_TOOLBOX_QUOTA_PROBE=1 $limit claude -p ok \
      --model haiku \
      --tools "" \
      --setting-sources project \
      --strict-mcp-config \
      --disable-slash-commands \
      --system-prompt "Reply with ok." \
      --output-format stream-json --verbose 2>/dev/null |
    jq -c 'select(.type == "rate_limit_event") | .rate_limit_info.unifiedWindows // empty' 2>/dev/null |
    tail -n 1
)
[ -z "$windows" ] && exit 0

# Same shape as the `rate_limits` block Claude Code pipes to the status line:
# used_percentage from 0 to 100, resets_at in epoch seconds.
tmp="$cache.$$.tmp"
jq -n --argjson w "$windows" --arg org "$org_uuid" --argjson now "$(date +%s)" '{
  fetched_at: $now,
  organization_uuid: $org,
  rate_limits: ($w | with_entries(
    select(.value.utilization != null)
    | .value = { used_percentage: ((.value.utilization * 1000 | round) / 10), resets_at: .value.resetsAt }
  ))
}' >"$tmp" 2>/dev/null && mv "$tmp" "$cache"
rm -f "$tmp"
