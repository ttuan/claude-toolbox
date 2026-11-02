#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Claude Code status line, offline.
#
#   ⚡Opus 5.5 [you@example.com @ Acme] │ 📊 [team] 5h:14%(1h12m) - 7d:3%(4d6h) │ 🧠 ▓▓▓▓░░░ 94%
#
# Everything comes from data Claude Code already has on this machine:
#   - model, context window and rate limits: the JSON Claude Code pipes in
#   - account email, organization and plan: $CLAUDE_CONFIG_DIR/.claude.json
#     (or ~/.claude.json when CLAUDE_CONFIG_DIR is unset)
# No keychain, no OAuth token, no network call. Works on macOS and Linux.
#
# Rate limits appear only for Pro, Max, Team and Enterprise plans, and only
# after the session's first API response, so the 📊 block is absent at the very
# start of a session. Each config dir shows its own account automatically.
# To show quota from the start, also run quota-probe.sh from a SessionStart
# hook; this script then reads its cache until the real numbers arrive.
#
# Needs: bash, jq.
# ─────────────────────────────────────────────────────────────

input=$(cat)

# One jq pass for every field. The separator is \x1f, not a tab: read collapses
# runs of whitespace separators, which would shift fields when one is empty.
IFS=$'\x1f' read -r model ctx_used ctx_left five_pct five_reset seven_pct seven_reset transcript <<<"$(
  jq -r '[
    .model.display_name // "",
    .context_window.used_percentage // "",
    .context_window.remaining_percentage // "",
    .rate_limits.five_hour.used_percentage // "",
    .rate_limits.five_hour.resets_at // "",
    .rate_limits.seven_day.used_percentage // "",
    .rate_limits.seven_day.resets_at // "",
    .transcript_path // ""
  ] | map(tostring) | join("\u001f")' <<<"$input" 2>/dev/null
)"

# ─────────────────────────────────────────────────────────────
# Account, from the config file Claude Code keeps for this config dir.
# Not ~/.claude/.claude.json: that one only holds migration flags.
# ─────────────────────────────────────────────────────────────
config_json="${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/.claude.json}"
config_json="${config_json:-$HOME/.claude.json}"

IFS=$'\x1f' read -r email org org_type org_uuid <<<"$(
  jq -r '.oauthAccount // {} | [
    .emailAddress // "", .organizationName // "", .organizationType // "",
    .organizationUuid // ""
  ] | join("\u001f")' "$config_json" 2>/dev/null
)"

# ─────────────────────────────────────────────────────────────
# Early quota (optional). Until Claude Code sends rate_limits, fall back to
# what quota-probe.sh cached at session start, if it ran. The cache must be
# under 10 minutes old and written for this same organization.
# ─────────────────────────────────────────────────────────────
if [ -z "$five_pct" ] && [ -z "$seven_pct" ]; then
  if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
    if command -v shasum >/dev/null 2>&1; then key=$(printf '%s' "$CLAUDE_CONFIG_DIR" | shasum -a 256 | cut -c1-8)
    else key=$(printf '%s' "$CLAUDE_CONFIG_DIR" | sha256sum | cut -c1-8)
    fi
  else
    key=default
  fi
  cache_dir="${TMPDIR:-/tmp}"
  quota_cache="${cache_dir%/}/claude-toolbox-quota-$key.json"
  if [ -f "$quota_cache" ]; then
    IFS=$'\x1f' read -r five_pct five_reset seven_pct seven_reset <<<"$(
      jq -r --arg org "$org_uuid" --argjson now "$(date +%s)" '
        select(($now - (.fetched_at // 0)) < 600)
        | select($org == "" or .organization_uuid == "" or .organization_uuid == $org)
        | .rate_limits
        | [ .five_hour, .seven_day ]
        | map(if . != null and .resets_at > $now then . else {} end)
        | [ .[0].used_percentage // "", .[0].resets_at // "",
            .[1].used_percentage // "", .[1].resets_at // "" ]
        | map(tostring) | join("\u001f")' "$quota_cache" 2>/dev/null
    )"
  fi
fi

# A personal account's org is auto-named "<email>'s Organization": no news.
org_base="${org%\'s Organization}"
org_base="${org_base%’s Organization}"
[ "$org_base" = "$email" ] && org=""

# claude_team -> team, claude_max -> max, claude_pro -> pro.
plan="${org_type#claude_}"

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
GRAY=$'\033[90m' RESET=$'\033[0m'

# Round a possibly fractional number to an integer; empty stays empty.
round() { [ -n "$1" ] && printf '%.0f' "$1" 2>/dev/null; }

usage_color() {
  local p
  p=$(round "$1")
  if [ -z "$p" ]; then printf '\033[90m'
  elif [ "$p" -ge 80 ]; then printf '\033[31m'
  elif [ "$p" -ge 50 ]; then printf '\033[33m'
  else printf '\033[32m'
  fi
}

# Epoch seconds -> "4d6h", "1h12m" or "47m": the two largest units left.
until_reset() {
  local at="$1" diff
  [ -z "$at" ] && return
  diff=$(( ${at%.*} - $(date +%s) ))
  [ "$diff" -le 0 ] && { printf '0m'; return; }
  if [ "$diff" -ge 86400 ]; then printf '%dd%dh' $((diff / 86400)) $((diff % 86400 / 3600))
  elif [ "$diff" -ge 3600 ]; then printf '%dh%dm' $((diff / 3600)) $((diff % 3600 / 60))
  else printf '%dm' $((diff / 60))
  fi
}

window() { # label pct reset
  local left
  printf '%s:%s%s%%%s' "$1" "$(usage_color "$2")" "$(round "$2")" "$RESET"
  left=$(until_reset "$3")
  [ -n "$left" ] && printf '%s(%s)%s' "$GRAY" "$left" "$RESET"
}

# ─────────────────────────────────────────────────────────────
# Build the line
# ─────────────────────────────────────────────────────────────
printf '\033[95m⚡%s\033[0m' "${model:-Claude}"

if [ -n "$email" ]; then
  printf ' %s[%s\033[36m%s%s' "$GRAY" "$RESET" "$email" "$RESET"
  [ -n "$org" ] && printf '%s @ %s\033[35m%s%s' "$GRAY" "$RESET" "$org" "$RESET"
  printf '%s]%s' "$GRAY" "$RESET"
fi

if [ -n "$five_pct" ] || [ -n "$seven_pct" ]; then
  printf ' %s│%s \033[96m📊\033[0m ' "$GRAY" "$RESET"
  [ -n "$plan" ] && printf '%s[%s]%s ' "$GRAY" "$plan" "$RESET"
  [ -n "$five_pct" ] && window 5h "$five_pct" "$five_reset"
  [ -n "$five_pct" ] && [ -n "$seven_pct" ] && printf ' - '
  [ -n "$seven_pct" ] && window 7d "$seven_pct" "$seven_reset"
fi

if [ -n "$ctx_left" ]; then
  width=15
  used=$(round "${ctx_used:-0}")
  left=$(round "$ctx_left")
  filled=$(( (used * width + 50) / 100 ))  # round, like printf %.0f
  [ "$filled" -gt "$width" ] && filled=$width
  [ "$filled" -lt 0 ] && filled=0
  if [ "$left" -gt 50 ]; then color=$'\033[32m' fill='▓'
  elif [ "$left" -gt 25 ]; then color=$'\033[33m' fill='▓'
  else color=$'\033[31m' fill='█'
  fi
  bar=""
  for ((i = 0; i < width; i++)); do
    if [ "$i" -lt "$filled" ]; then bar+="$fill"; else bar+='░'; fi
  done
  printf ' %s│%s \033[93m🧠\033[0m %s%s %s%%%s' "$GRAY" "$RESET" "$color" "$bar" "$left" "$RESET"
fi

# ─────────────────────────────────────────────────────────────
# Optional: hand the account and 5h quota to the herdr sidebar.
# Runs in the background so the status line never waits on it.
# ─────────────────────────────────────────────────────────────
if command -v herdr-claude-meta >/dev/null 2>&1; then
  herdr-claude-meta \
    --email "$email" \
    --org "$org" \
    --five-pct "$five_pct" \
    --five-reset "$five_reset" \
    --transcript "$transcript" \
    >/dev/null 2>&1 &
fi
