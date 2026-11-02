import { expect, test } from 'claude-code/testing'

import { parseCommand } from './commands'

const TOOL_USE = {
  plugin: 'skin',
  component: 'ToolUse',
  requestId: 'call',
  surface: 'terminal',
} as const

const TOOL_RESULT = {
  plugin: 'skin',
  component: 'ToolResult',
  requestId: 'call',
  surface: 'terminal',
} as const

const useProps = (tool: string, input: unknown, extra: object = {}) => ({
  tool_use_id: 'call',
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...extra,
})

const resultProps = (tool: string, extra: object = {}) => ({
  tool_use_id: 'call',
  tool,
  output: {},
  isErrored: false,
  ...extra,
})

// Stands for the engine, so a drawing the mod left alone reads `engine`.
function withEngine(on: any) {
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

// Answers each state read by the key it asks for.
function withState(on: any, values: Record<string, unknown>) {
  on('state.get', (_: any, e: any) => {
    const key = typeof e === 'string' ? e : (e.ref?.key ?? e.key)
    return key in values ? { value: { value: values[key], version: 1 } } : { value: { version: 0 } }
  })
}

const bashResult = (lines: number, extra: object = {}) =>
  resultProps('Bash', {
    output: { stdout: Array.from({ length: lines }, (_, i) => `row${i + 1}`).join('\n') + '\n', stderr: '' },
    ...extra,
  })

function compactOn(on: any) {
  on('state.get', () => ({ value: { value: true, version: 1 } }))
}

test('off: Bash keeps its command line and the result goes to the engine', async ($, on) => {
  withEngine(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('Bash', { command: 'ls -la', description: 'List files' }),
  })
  expect(await row.find({ type: 'Text', text: /ls/ })).toBeTruthy()
  await row.unmount()

  const body = await $.ui.mount({ ...TOOL_RESULT, props: resultProps('Bash') })
  expect(await body.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await body.unmount()
})

test('compact: Bash shows its description and no command', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('Bash', { command: 'ls -la', description: 'List files' }),
  })
  expect(await row.find({ type: 'Text', text: /List files/ })).toBeTruthy()
  expect(await row.find({ type: 'Text', text: /^ls$/ })).toBeFalsy()
  await row.unmount()
})

test('compact: Bash without a description falls back to its first line', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('Bash', { command: 'make test\nmake lint' }),
  })
  expect(await row.find({ type: 'Text', text: /make test/ })).toBeTruthy()
  expect(await row.find({ type: 'Text', text: /make lint/ })).toBeFalsy()
  await row.unmount()
})

test('compact: Bash past maxChars is still hidden', async ($, on) => {
  compactOn(on)
  withEngine(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('Bash', { command: 'x'.repeat(5000), description: 'Long one' }),
  })
  expect(await row.find({ type: 'Text', text: /Long one/ })).toBeTruthy()
  await row.unmount()
})

test('compact: Edit counts the lines it changed', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps(
      'Edit',
      { file_path: '/a/b.ts' },
      { output: { structuredPatch: [{ lines: [' same', '+new', '+new2', '-old'] }] } },
    ),
  })
  expect(await row.find({ type: 'Text', text: /\+2/ })).toBeTruthy()
  expect(await row.find({ type: 'Text', text: /-1/ })).toBeTruthy()
  await row.unmount()
})

test('compact: a new file counts its lines', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps(
      'Write',
      { file_path: '/a/b.ts' },
      { output: { type: 'create', content: 'one\ntwo\nthree' } },
    ),
  })
  expect(await row.find({ type: 'Text', text: /\+3/ })).toBeTruthy()
  await row.unmount()
})

test('a tool with no bespoke row shows its name and a key argument', async ($, on) => {
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('WebFetch', { url: 'https://x.test', description: 'Read docs' }),
  })
  expect(await row.find({ type: 'Text', text: /WebFetch/ })).toBeTruthy()
  expect(await row.find({ type: 'Text', text: /x\.test/ })).toBeTruthy()
  await row.unmount()
})

test('a tool with no argument falls back to its description', async ($, on) => {
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('WebFetch', { description: 'Read docs' }),
  })
  expect(await row.find({ type: 'Text', text: /WebFetch/ })).toBeTruthy()
  expect(await row.find({ type: 'Text', text: /Read docs/ })).toBeTruthy()
  await row.unmount()
})

test('compact: the result is hidden', async ($, on) => {
  compactOn(on)
  withEngine(on)
  const body = await $.ui.mount({ ...TOOL_RESULT, props: resultProps('Edit') })
  expect(await body.find({ type: 'Text', text: /engine/ })).toBeFalsy()
  await body.unmount()
})

test('compact: ctrl+o, an error and kept tools all reach the engine', async ($, on) => {
  compactOn(on)
  withEngine(on)
  for (const props of [
    resultProps('Bash', { isExpanded: true }),
    resultProps('Bash', { isErrored: true }),
    resultProps('ExitPlanMode'),
  ]) {
    const body = await $.ui.mount({ ...TOOL_RESULT, props })
    expect(await body.find({ type: 'Text', text: /engine/ })).toBeTruthy()
    await body.unmount()
  }

  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('AskUserQuestion', { questions: [] }),
  })
  expect(await row.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await row.unmount()
})

test('compact: ctrl+o shows the whole Bash command', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps('Bash', { command: 'ls\npwd', description: 'Two' }, { isExpanded: true }),
  })
  expect(await row.find({ type: 'Text', text: /pwd/ })).toBeTruthy()
  await row.unmount()
})

test('lines: a count keeps that many and says how many are left', async ($, on) => {
  withState(on, { outputLines: 2 })
  const body = await $.ui.mount({ ...TOOL_RESULT, props: bashResult(5) })
  expect(await body.find({ type: 'Text', text: /row2/ })).toBeTruthy()
  expect(await body.find({ type: 'Text', text: /row3/ })).toBeFalsy()
  expect(await body.find({ type: 'Text', text: /\+3 lines/ })).toBeTruthy()
  await body.unmount()
})

test('lines: max draws every line', async ($, on) => {
  withState(on, { outputLines: 'max' })
  const body = await $.ui.mount({ ...TOOL_RESULT, props: bashResult(40) })
  expect(await body.find({ type: 'Text', text: /row40/ })).toBeTruthy()
  expect(await body.find({ type: 'Text', text: /expand/ })).toBeFalsy()
  await body.unmount()
})

test('lines: an Edit colours the lines it keeps', async ($, on) => {
  withState(on, { outputLines: 1 })
  const body = await $.ui.mount({
    ...TOOL_RESULT,
    props: resultProps('Edit', { output: { structuredPatch: [{ lines: ['-old', '+new'] }] } }),
  })
  expect(await body.find({ type: 'Text', text: /-old/ })).toBeTruthy()
  expect(await body.find({ type: 'Text', text: /\+new/ })).toBeFalsy()
  await body.unmount()
})

test('lines: ctrl+o, an error, compact and unknown tools leave it alone', async ($, on) => {
  withState(on, { outputLines: 1 })
  withEngine(on)
  for (const props of [
    bashResult(5, { isExpanded: true }),
    bashResult(5, { isErrored: true }),
    resultProps('WebFetch', { output: { result: 'x' } }),
    bashResult(0),
  ]) {
    const body = await $.ui.mount({ ...TOOL_RESULT, props })
    expect(await body.find({ type: 'Text', text: /engine/ })).toBeTruthy()
    await body.unmount()
  }
})

test('lines: compact still hides the output', async ($, on) => {
  withState(on, { outputLines: 3, compact: true })
  const body = await $.ui.mount({ ...TOOL_RESULT, props: bashResult(5) })
  expect(await body.find({ type: 'Text', text: /row1/ })).toBeFalsy()
  await body.unmount()
})

test('a new file ending in a newline is not counted a line over', async ($, on) => {
  compactOn(on)
  const row = await $.ui.mount({
    ...TOOL_USE,
    props: useProps(
      'Write',
      { file_path: '/a/b.ts' },
      { output: { type: 'create', content: 'one\ntwo\n' } },
    ),
  })
  expect(await row.find({ type: 'Text', text: /\+2/ })).toBeTruthy()
  await row.unmount()
})

// --- /skin command grammar ---

test('command: an empty line and "status" show the settings', () => {
  expect(parseCommand('')).toEqual({ kind: 'status' })
  expect(parseCommand('status')).toEqual({ kind: 'status' })
})

test('command: help and reset', () => {
  expect(parseCommand('help')).toEqual({ kind: 'help' })
  expect(parseCommand('reset')).toEqual({ kind: 'reset' })
})

test('command: colors on and off, in loose wording', () => {
  expect(parseCommand('colors on')).toEqual({ kind: 'colors', on: true })
  expect(parseCommand('colours off')).toEqual({ kind: 'colors', on: false })
  expect(parseCommand('turn colors off')).toEqual({ kind: 'colors', on: false })
})

test('command: details show and hide, in either order', () => {
  expect(parseCommand('details hide')).toEqual({ kind: 'details', show: false })
  expect(parseCommand('hide details')).toEqual({ kind: 'details', show: false })
  expect(parseCommand('details show')).toEqual({ kind: 'details', show: true })
  expect(parseCommand('show details')).toEqual({ kind: 'details', show: true })
})

test('command: the old compact wording still works', () => {
  expect(parseCommand('compact on')).toEqual({ kind: 'details', show: false })
  expect(parseCommand('compact off')).toEqual({ kind: 'details', show: true })
})

test('command: output counts, all and default, in loose wording', () => {
  for (const line of ['output 3', 'output 3 lines', 'show 3 lines', 'limit output to 3 lines']) {
    expect(parseCommand(line)).toEqual({ kind: 'output', lines: 3 })
  }
  expect(parseCommand('output all')).toEqual({ kind: 'output', lines: 'max' })
  expect(parseCommand('show all output')).toEqual({ kind: 'output', lines: 'max' })
  expect(parseCommand('output default')).toEqual({ kind: 'output', lines: null })
})

test('command: a missing value or unknown words are not guessed', () => {
  expect(parseCommand('colors').kind).toBe('unknown')
  expect(parseCommand('details').kind).toBe('unknown')
  expect(parseCommand('output').kind).toBe('unknown')
  expect(parseCommand('banana').kind).toBe('unknown')
})

// The kit has no $.store of its own: keep it in a map for the test.
function withStore(on: any) {
  const values: Record<string, unknown> = {}
  on('store.get', (_: any, e: any) => ({ value: values[e.key] }))
  on('store.set', (_: any, e: any) => {
    values[e.key] = e.value
    return { value: undefined }
  })
}

test('command: /skin answers in full sentences', async ($, on) => {
  withStore(on)
  const set = await $.command.run({ command: 'skin', args: 'output 3' })
  expect(set.text).toMatch(/Tool output now shows the first 3 lines/)
  const status = await $.command.run({ command: 'skin', args: '' })
  expect(status.text).toMatch(/Output:\s+the first 3 lines/)
  const unknown = await $.command.run({ command: 'skin', args: 'banana' })
  expect(unknown.text).toMatch(/didn't understand "banana"/)
})
