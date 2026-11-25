import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const T0 = Date.parse('2026-11-25T12:00:00Z')

const BAND = {
  plugin: 'code-tab-hud',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 130,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// 82% context; 5h at 46% with 30% of the window gone (ahead of pace).
const MEASURE = {
  context: { tokens: 164_000, window: 200_000, percent: 82 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 46, resetsAt: '2026-11-25T15:30:00Z' },
    { kind: 'seven_day', percentUsed: 20, resetsAt: '2026-11-30T12:00:00Z' },
  ],
  changed: ['context', 'rateLimits'],
} as const

type Seen = { toasts: string[]; scenes: string[]; prompts: string[] }

// Each hook here stands for the engine beneath the mod.
const engine = (on: On): Seen => {
  const seen: Seen = { toasts: [], scenes: [], prompts: [] }
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: T0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('mcp.call', () => ({ value: { content: [{ type: 'text', text: '[]' }] } }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('theme.set', (_, e) => {
    const b = e.backdrop
    seen.scenes.push(b !== undefined && 'scene' in b ? String(b.scene) : 'other')

    return { value: { isDrawn: true, requestId: 'r1' } }
  })
  on('prompt.submit', (_, e) => {
    seen.prompts.push(e.text)

    return { text: e.text }
  })

  return seen
}

test('82% context: zone, handoff button, toasts, orange tint', async ($, on) => {
  mock.clock(on, { now: T0 })
  const seen = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  expect(seen.toasts.some(t => t.startsWith('Context 82%'))).toBe(true)
  expect(seen.toasts.some(t => t.startsWith('5-hour limit is ahead of pace'))).toBe(true)
  expect(seen.toasts.some(t => t.startsWith('7-day'))).toBe(false)
  expect(seen.scenes).toEqual(['edge-80'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /◆ 82%/ }))?.text).toBe('◆ 82%')
    expect((await ui.find({ type: 'Text', text: /Hand off/ }))?.text).toBe('Hand off')
    expect((await ui.find({ type: 'Text', text: /fills ~1h46m/ }))?.text).toBe(
      'fills ~1h46m',
    )
    expect((await ui.find({ type: 'Text', text: /cache 5m/ }))?.text).toBe('cache 5m')
    await ui.press({ key: 'handoff' })
    await ui.unmount()
  }
  expect(seen.prompts.length).toBe(2)
})

test('a second reading does not toast again', async ($, on) => {
  mock.clock(on, { now: T0 })
  const seen = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)
  await $.session.measure(MEASURE)

  expect(seen.toasts.length).toBe(2)
  expect(seen.scenes).toEqual(['edge-80'])
})

test('stale data greys out and the cache goes cold', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)
  await clock.advance(11 * 60_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^\d+m old$/}))?.text).toBe('11m old')
  expect((await ui.find({ type: 'Text', text: /cache cold/ }))?.text).toBe('cache cold')
  await ui.unmount()
})

test('narrow band drops secondary text first', async ($, on) => {
  mock.clock(on, { now: T0 })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 50 } })
  expect(await ui.find({ type: 'Text', text: /Hand off/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /fills/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /◆ 82%/ }))?.text).toBe('◆ 82%')
  await ui.unmount()
})

test('settings row toggles the tint off and saves it', async ($, on) => {
  mock.clock(on, { now: T0 })
  const seen = engine(on)
  on('theme.clear', () => ({ value: { isDrawn: false, reason: 'cleared' } as never }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 't-tint' })
  expect((await ui.find({ key: 't-tint' }))?.text).toContain('☐ amber from 60%')
  expect(seen.scenes).toEqual(['edge-80'])
  await ui.unmount()
})
