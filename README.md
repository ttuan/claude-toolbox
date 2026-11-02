# claude-toolbox

A toolbox of [Claude Code](https://claude.com/claude-code) customizations by
ttuan, packaged so other people can install and reuse them: plugins, skills, a
status line, and the herdr sidebar setup.

The repository doubles as a **Claude Code plugin marketplace**
(`.claude-plugin/marketplace.json`), so plugins here install with one command.

## Layout

| Folder | What lives here |
| --- | --- |
| `plugins/` | Claude Code plugins / mods, each in its own folder, listed in the marketplace |
| `skills/` | Custom skills |
| `statusline/` | Claude Code status line scripts |
| `herdr/` | herdr status sidebar config |
| `docs/` | Notes and documentation |

Empty folders are kept with a `.gitkeep` until their first real file lands.

## Plugins

| Plugin | What it does |
| --- | --- |
| `bash-syntax` | Syntax-highlights tool-call rows (Bash, Read, Edit, Write, Glob, Grep and more) with per-tool icons, an optional compact mode, and an output-line limit. Toggle with `/bash-syntax`. |

## Install a plugin

Add the marketplace once, then install what you want:

```bash
claude plugin marketplace add ttuan/claude-toolbox
claude plugin install bash-syntax@claude-toolbox
```

To install from a local clone instead of GitHub:

```bash
claude plugin marketplace add ~/code/claude-toolbox
claude plugin install bash-syntax@claude-toolbox
```

Each Claude config dir (`~/.claude`, and any other `CLAUDE_CONFIG_DIR`) has its
own plugin list. If several config dirs symlink the same `settings.json`, they
share the enable state and you install once.

## Develop a plugin

```bash
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
```

## License

MIT. See `LICENSE`.
