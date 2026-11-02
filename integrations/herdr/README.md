# herdr sidebar

Shows which account each Claude Code or Codex pane runs, and how much of its
5-hour quota is gone, right in the [herdr](https://herdr.dev) sidebar. Useful
when several accounts run side by side, one config dir each.

```text
|<--------- 26 columns ----->|
my-project          agents      <- workspace + session name (or tab name)
⠐ working           claude      <- herdr's own state and agent tokens
👤 alice · Acme                 <- account of this pane
📊 5h 23% (43m)                 <- 5-hour quota: green < 70%, orange 70-89%, red >= 90%
```

Each pane reports its own values, so whichever account runs in whichever pane
shows correctly, with no mapping to maintain.

## Files

| File | What it is |
| --- | --- |
| `sidebar.toml` | The sidebar rows to copy into `~/.config/herdr/config.toml` |
| `herdr-claude-meta.sh` | Pushes a Claude pane's session name, account and quota to herdr |
| `herdr-codex-meta.py` | The same for Codex panes, from local Codex files |
| `codex-hooks.json` | Codex hooks that run `herdr-codex-meta` |

Both scripts call no API, never print anything and always exit 0. Outside herdr
they do nothing.

## Install

Needs herdr 0.8 or later and `python3`. Link the scripts onto your `PATH`:

```bash
ln -s ~/code/claude-toolbox/integrations/herdr/herdr-claude-meta.sh ~/.local/bin/herdr-claude-meta
ln -s ~/code/claude-toolbox/integrations/herdr/herdr-codex-meta.py ~/.local/bin/herdr-codex-meta
```

Copy the sections of `sidebar.toml` into `~/.config/herdr/config.toml`, then
apply them without restarting:

```bash
herdr config check           # config: ok
herdr server reload-config   # status: "applied"
```

### Claude Code

Nothing more to do if you use the toolbox [status line](../../settings/statusline):
it calls `herdr-claude-meta` in the background on every render whenever the
command is on your `PATH`.

With your own status line, add this at its end, filling in the values your
script already has:

```sh
if command -v herdr-claude-meta >/dev/null 2>&1; then
  herdr-claude-meta \
    --email "$email" \
    --org "$org" \
    --five-pct "$five_hour_used_percentage" \
    --five-reset "$five_hour_resets_at" \
    --transcript "$(jq -r '.transcript_path // empty' <<<"$input")" \
    >/dev/null 2>&1 &
fi
```

`--five-reset` takes epoch seconds, as Claude Code sends them, or ISO 8601.

### Codex

Install herdr's own Codex integration once, for the working and idle states:

```bash
herdr integration install codex
```

Then merge the hooks in `codex-hooks.json` into `~/.codex/hooks.json`, open
`/hooks` in Codex and trust them. The script reads only the active session's
transcript and `~/.codex/auth.json`, and never logs credentials.

## How it works

```text
Claude Code pane (CLAUDE_CONFIG_DIR=~/.claude-<name>)
   |  every status line render
   v
statusline.sh   already has the email, org, 5h quota and transcript path
   |  runs in the background
   v
herdr-claude-meta
   |  reads $HERDR_PANE_ID and $HERDR_SOCKET_PATH from the pane
   v
herdr socket: pane.report_metadata  ->  sidebar rows 1, 3 and 4
```

### Row 1: session name, else tab name

Row 1 uses the `$convo` token instead of herdr's `tab` token. It shows the name
you gave the session with `/rename`, and falls back to the tab name otherwise.
Claude Code's own `session_name` cannot tell the two apart, because before
`/rename` it holds an auto-generated title. So the script looks for a
`custom-title` record in the transcript, which only `/rename` writes. Scanning
a 1 MB transcript this way takes about 2 ms.

Because the config has no conditions, the script picks one value and pushes it.
Renaming a tab therefore shows up on the next status line render, not at once.

### Why the quota needs three tokens

Sidebar style tokens are static: unlike herdr's built-in `state_icon`, they
cannot change colour by value. So the config declares `$quota_ok`,
`$quota_warn` and `$quota_crit`, each with a fixed colour. On every run the
script fills exactly one and clears the other two, which looks like one row
changing colour.

The sidebar is 26 columns wide by default, so the script shortens long values:
it cuts the middle out of the email's local part and clips the rest with `…`.

Values expire after 6 hours (`ttl_ms`), so a closed pane does not keep stale
numbers forever.

## Verify

Inside a herdr pane:

```bash
herdr-claude-meta --email a@b.com --five-pct 95 --five-reset ""
herdr pane get "$HERDR_PANE_ID" | python3 -m json.tool | grep -A5 tokens
```

You should see `"acct": "👤 a"` and `"quota_crit": "📊 5h 95%"`. Try `42` and
`78` for the other two colours. Real values appear after the pane's next status
line render.

## Troubleshooting

| Symptom | Common cause |
| --- | --- |
| No extra rows at all | `herdr server reload-config` was not run after editing `config.toml` |
| One pane shows them, another does not | That pane has not rendered its status line yet. Type something in it |
| `unknown sidebar token` from `herdr config check` | A token in `rows_by_agent` is missing its `$` prefix |
| Old numbers after quitting Claude | They expire after 6 hours; push empty values to clear them now |
| Row 1 lost the tab name | `--transcript` is not passed, or `herdr tab get "$HERDR_TAB_ID"` returns no `label` |
| `/rename` done, still shows the tab name | The session has not re-rendered its status line yet |
| Running a script by hand shows nothing | Expected outside herdr: it needs `HERDR_ENV`, `HERDR_PANE_ID` and `HERDR_SOCKET_PATH` |

The scripts talk to herdr's JSON-RPC socket directly rather than through
`herdr pane report-metadata`, whose argument parsing was inconsistent in 0.8.0.
