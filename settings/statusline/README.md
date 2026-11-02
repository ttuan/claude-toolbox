# statusline

An offline status line for Claude Code: model, account, plan quota and context
window, in one line.

```text
⚡Opus 5.5 [you@example.com @ Acme] │ 📊 [team] 5h:14%(1h12m) - 7d:3%(4d6h) │ 🧠 ▓░░░░░░░░░░░░░░ 94%
```

| Part | Where it comes from |
| --- | --- |
| `⚡Opus 5.5` | `model.display_name` in the JSON Claude Code pipes in |
| `[email @ org]` | `oauthAccount` in `$CLAUDE_CONFIG_DIR/.claude.json`, or `~/.claude.json` |
| `📊 [team] 5h:… 7d:…` | `rate_limits` in the piped JSON; the plan comes from `oauthAccount.organizationType` |
| `🧠` bar | `context_window` in the piped JSON, showing how much is left |

It reads no keychain, no OAuth token and calls no network: everything is data
Claude Code already has on the machine. It runs on macOS and Linux and takes
about 60 ms per render.

## When the quota shows up

Claude Code only sends `rate_limits` for Pro, Max, Team and Enterprise plans,
and only after the session's first API response. So a fresh session starts
without the 📊 block, and it appears after your first message. Each window can
be missing on its own, and drops out once its reset time passes.

Usage colours: green under 50%, yellow from 50%, red from 80%. The context bar
turns yellow below 50% left and red below 25% left.

To have the quota from the first seconds of a session, add the optional
[quota probe](#quota-from-the-start-of-a-session-optional).

## Several accounts

Each `CLAUDE_CONFIG_DIR` is its own account, and the script reads the account
file of whichever config dir the session runs under. One copy of the script
serves every account.

## Install

Needs `bash` and `jq`. Link the script into your config dir:

```bash
ln -s ~/code/claude-toolbox/settings/statusline/statusline.sh ~/.claude/statusline.sh
```

Then point `statusLine` at it in `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/statusline.sh",
  "padding": 0
}
```

## Quota from the start of a session (optional)

`quota-probe.sh` fills the gap before the session's first API response. A
SessionStart hook starts it in the background; it sends one tiny headless
request and caches the 5-hour and 7-day numbers Claude Code reports for it. The
status line shows that cache until Claude Code sends the real numbers, then
switches to them.

```text
0 s    session opens, you can type at once, no 📊 yet
~4 s   the probe finishes and writes the cache
≤ 5 s  the next status line refresh shows 📊 from the cache
later  after the first reply, 📊 comes from Claude Code itself
```

What it costs, so you can decide:

- About 560 input tokens and 4 seconds per session start, in the background.
  The request has no tools, no settings, no MCP servers and a one-line system
  prompt, and uses Haiku.
- It counts toward your plan quota, by a negligible amount.
- It reads a `rate_limit_event` from `claude -p --output-format stream-json`,
  which is not a documented interface and may change.

### Install the probe

Link it next to the status line:

```bash
ln -s ~/code/claude-toolbox/settings/statusline/quota-probe.sh ~/.claude/quota-probe.sh
```

Add a SessionStart hook and a `refreshInterval` to `~/.claude/settings.json`.
Without `refreshInterval` the status line would not redraw until the first
reply, and the probe would be pointless:

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/statusline.sh",
  "padding": 0,
  "refreshInterval": 5
},
"hooks": {
  "SessionStart": [
    {
      "matcher": "startup|resume",
      "hooks": [{ "type": "command", "command": "~/.claude/quota-probe.sh --detach" }]
    }
  ]
}
```

`refreshInterval` re-runs the status line every 5 seconds. It is local, takes
about 60 ms and costs no tokens. Remove the hook to turn the probe off.

### Several accounts

The probe calls plain `claude` with the environment the session gives it, so a
session started with `CLAUDE_CONFIG_DIR=~/.claude-work` probes that account.
It never sets `CLAUDE_CONFIG_DIR` itself: setting it to `~/.claude` is not the
same as leaving it unset, and Claude Code then reports "Not logged in".

- Each login gets its own cache in `$TMPDIR`, keyed on a hash of
  `CLAUDE_CONFIG_DIR`, or `default` when it is unset.
- The cache records the organization it was written for. After a `/login` to
  another organization in the same config dir, the old cache is ignored.
- The status line trusts the cache for 10 minutes at most, and drops a window
  once its reset time has passed.

### It stays out of the way

- `--detach` returns in about 50 ms; the request runs in the background.
- It runs at most once a minute per login, and only one at a time.
- It skips sessions that use `ANTHROPIC_API_KEY`, which have no plan quota.
- It runs from an empty scratch folder, so no project hooks or `CLAUDE.md` load,
  and it never starts itself again from inside its own request.

## herdr sidebar

If a `herdr-claude-meta` command is on your `PATH`, the script also hands it the
account and the 5-hour quota in the background, for the
[herdr](../../integrations/herdr) sidebar. Without it, nothing happens.
