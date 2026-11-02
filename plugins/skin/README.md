# skin

A Claude Code mod that restyles how the transcript looks. Today it redraws the
tool-call rows; the plan is to grow it into a configurable skin for Claude
Code's display (colour palettes, output styling).

## What it does now

It hooks `ui.render` for the `ToolUse` and `ToolResult` components and redraws
each tool call:

- **Per-tool icons** (Nerd Font) in place of the `⏺` bullet, coloured by the
  call's state: running, done, interrupted, failed.
- **Bash commands** are tokenised and coloured: the command name of each simple
  command, keywords, strings, variables, flags and numbers. A leading
  `NAME=value` env prefix is kept faint so the real command stands out.
- **Summary line**: the call's description sits next to the tool name, in teal
  italics, joined with a dash.
- **Read, Edit, Write, Glob, Grep** show their path or pattern, with the folder
  dimmed and the file name highlighted.
- **Other tools** (WebFetch, ToolSearch, MCP tools, ...) get an icon, their name
  and one key argument such as the URL or query.
- Agent, AskUserQuestion, plan and task tools are left to the engine.

The colours are a Monokai-style palette tuned for a dark background.

## Install

```bash
claude plugin marketplace add ttuan/claude-toolbox
claude plugin install skin@claude-toolbox
```

Icons need a [Nerd Font](https://www.nerdfonts.com/) in your terminal.

## Turn it on or off

`/skin on`, `/skin off`, or `/skin` alone to flip it. The default lives in
`/config` as **Highlight tool rows**, next to **Max length to highlight**, which
skips colouring for very long commands.

## Compact mode

`/skin compact [on | off]` hides tool details, leaving one line per call:
the tool name and its summary. With no argument it flips the current state, and
the choice carries over to later sessions.

```text
 Bash - Run the test suite
 Edit(hooks/register.tsx) +12 -3
```

Bash shows its description, or the start of the command when it has none. Edit
and Write show the path and the lines changed. Output and diffs are hidden.

- Press ctrl+o to see the full call and its output.
- A failed call still shows its error.
- Permission dialogs still show the full command.
- Agent, AskUserQuestion, plan and task tools are left as they are.
- Only the display changes: the model reads the same output, so no tokens are saved.

## Output lines

`/skin lines <n | max | default>` sets how many lines of Bash, Edit and
Write output a tool row draws, and carries over to later sessions.

- `3` draws three lines, then `… +N lines (ctrl+o to expand)`.
- `max` draws every line.
- `0` draws only the `… +N lines` hint.
- `default` goes back to the engine's own rows.

Compact mode wins: while it is on, no output is drawn. Errors, ctrl+o and other
tools (Read, Grep, MCP tools) keep the engine's rows.
