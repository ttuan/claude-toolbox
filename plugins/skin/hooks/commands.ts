import type { OutputLines } from '../types'

// What a `/skin ...` line asks for. The parser is forgiving about word order
// and filler words, so "output 3", "output 3 lines", "show 3 lines" and
// "limit output to 3 lines" all mean the same thing.
export type SkinAction =
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'reset' }
  | { kind: 'colors'; on: boolean }
  | { kind: 'details'; show: boolean }
  | { kind: 'output'; lines: OutputLines }
  | { kind: 'unknown'; input: string; hint?: string }

const ON = new Set(['on', 'enable', 'enabled', 'true', 'yes'])
const OFF = new Set(['off', 'disable', 'disabled', 'false', 'no'])
const COLORS = new Set(['color', 'colors', 'colour', 'colours', 'highlight', 'highlighting'])
const DETAILS = new Set(['detail', 'details'])
const OUTPUT = new Set(['output', 'outputs', 'line', 'lines'])
const ALL = new Set(['all', 'max', 'every', 'everything', 'full'])
const DEFAULT = new Set(['default', 'auto'])

export function parseCommand(raw: string): SkinAction {
  const input = raw.trim()
  const words = input.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'status' }

  const has = (set: Set<string>) => words.some(w => set.has(w))
  const number = words.find(w => /^\d+$/.test(w))

  if (has(new Set(['help', '?', '-h', '--help']))) return { kind: 'help' }
  if (has(new Set(['status', 'state', 'settings']))) return { kind: 'status' }
  if (has(new Set(['reset']))) return { kind: 'reset' }

  if (has(COLORS)) {
    if (has(ON)) return { kind: 'colors', on: true }
    if (has(OFF)) return { kind: 'colors', on: false }
    return { kind: 'unknown', input, hint: 'Say /skin colors on or /skin colors off.' }
  }

  // `compact` is the old name for hiding details: compact on = details hide.
  if (has(DETAILS) || words.includes('compact')) {
    const compact = words.includes('compact')
    if (has(new Set(['hide', 'hidden'])) || (compact && has(ON))) {
      return { kind: 'details', show: false }
    }
    if (has(new Set(['show', 'shown'])) || (compact && has(OFF))) {
      return { kind: 'details', show: true }
    }
    return { kind: 'unknown', input, hint: 'Say /skin details show or /skin details hide.' }
  }

  if (has(OUTPUT) || number !== undefined || has(ALL)) {
    if (number !== undefined) return { kind: 'output', lines: Number(number) }
    if (has(ALL)) return { kind: 'output', lines: 'max' }
    if (has(DEFAULT)) return { kind: 'output', lines: null }
    return {
      kind: 'unknown',
      input,
      hint: 'Say /skin output 3, /skin output all or /skin output default.',
    }
  }

  return { kind: 'unknown', input }
}

export const ARGUMENT_HINT =
  'colors on|off · details show|hide · output <n>|all|default · reset · help'

export const HELP = [
  'skin commands',
  '  /skin                       show the current settings',
  '  /skin colors on | off       turn tool-row colours on or off',
  '  /skin details hide | show   hide tool details (one line per call) or show them',
  '  /skin output 3              show only the first 3 lines of each tool’s output',
  '  /skin output all            show every line of output',
  '  /skin output default        let Claude Code decide',
  '  /skin reset                 go back to the defaults',
  '  /skin help                  this list',
  '',
  'Word order is loose: "hide details", "show 3 lines" and',
  '"limit output to 3 lines" work too. Press ctrl+o on any call to see it in full.',
].join('\n')

export function describeOutput(lines: OutputLines): string {
  if (lines === null) return 'Claude Code’s default'
  if (lines === 'max') return 'every line'
  if (lines === 0) return 'only a line count'
  return lines === 1 ? 'the first line' : `the first ${lines} lines`
}
