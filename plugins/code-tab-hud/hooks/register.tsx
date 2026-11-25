import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Flags, LimitWindow, Meter, Prefs, Probe, Tint } from '../types'

// v1 items 1 (meter strip), 7 (toasts), 8 (edge tint).
// Status is never color alone: each zone has a glyph and a word.

const DEFAULT_PREFS: Prefs = {
  toastContext: true,
  toastPace: true,
  toastStale: false,
  tint: true,
}
const NO_FLAGS: Flags = { ctx80: false, stale: false }

// Change a shape tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const meter = atom({ plugin: 'code-tab-hud', key: 'meter' } as const, null, {
  shape: 'meter-1',
})
const lastReplyAt = atom(
  { plugin: 'code-tab-hud', key: 'lastReplyAt' } as const,
  null,
)
const now = atom({ plugin: 'code-tab-hud', key: 'now' } as const, 0)
const prefs = atom({ plugin: 'code-tab-hud', key: 'prefs' } as const, DEFAULT_PREFS, {
  shape: 'prefs-1',
})
const flags = atom({ plugin: 'code-tab-hud', key: 'flags' } as const, NO_FLAGS, {
  shape: 'flags-1',
})
const showSettings = atom(
  { plugin: 'code-tab-hud', key: 'showSettings' } as const,
  false,
)
const tint = atom({ plugin: 'code-tab-hud', key: 'tint' } as const, 'none' as Tint)
const probe = atom({ plugin: 'code-tab-hud', key: 'probe' } as const, null, {
  shape: 'probe-1',
})

// Read-only check that the desktop's session tools answer this mod: the base
// for the All chats list (item 11) and chip actions (item 2). The raw reply is
// kept in $.store under 'probe' to read its shape.
const runProbe = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  let result: Probe
  try {
    const r = await $.mcp.call('ccd_session_mgmt', 'list_sessions', { limit: 5 })
    const text = (r.content ?? [])
      .map(b => (b.type === 'text' ? b.text : `[${b.type}]`))
      .join('\n')
    await $.store.set('probe', { at, isError: r.isError === true, text: text.slice(0, 4000) })
    result = {
      isOk: r.isError !== true,
      note: r.isError === true ? `error: ${text.slice(0, 120)}` : `answered, ${text.length} chars`,
      at,
    }
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err)
    await $.store.set('probe', { at, thrown: note.slice(0, 4000) })
    result = { isOk: false, note: `threw: ${note.slice(0, 120)}`, at }
  }
  await update($, probe, () => result)
}

const GOOD = '#0aac23'
const WARN = '#fbb315'
const SERIOUS = '#f18a59'
const THINK = '#338ced'
const TRACK = '#8a8a8a'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const CACHE_MS = 5 * MIN
const STALE_MS = 10 * MIN
const FIVE_MS = 5 * HOUR
const SEVEN_MS = 7 * DAY
const NS = 'http://www.w3.org/2000/svg'

const HANDOFF_PROMPT =
  'Write a handoff for this chat with the handoff skill, so a fresh chat can continue this work.'

type Zone = { name: string; glyph: string; color: string }

const zoneOf = (pct: number | undefined): Zone | null => {
  if (pct === undefined) return null
  if (pct >= 80) return { name: 'Hand off', glyph: '◆', color: SERIOUS }
  if (pct >= 60) return { name: 'Wrap up', glyph: '▲', color: WARN }
  if (pct >= 40) return { name: 'Working', glyph: '◐', color: THINK }

  return { name: 'Roomy', glyph: '●', color: GOOD }
}

const dur = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 === 0 ? `${h}h` : `${h}h${m % 60}m`
  const d = Math.floor(h / 24)

  return h % 24 === 0 ? `${d}d` : `${d}d${h % 24}h`
}

type Pace = { elapsed: number; isAhead: boolean; tail: string }

// Even pace = the share of the window gone. The window length is assumed
// (5h, 7d): the API gives only resetsAt. "full in" is a straight-line
// projection from the window's start, an estimate.
const paceOf = (w: LimitWindow, len: number, t: number): Pace | null => {
  if (w.resetsAt === undefined) return null
  const resets = Date.parse(w.resetsAt)
  if (Number.isNaN(resets)) return null
  const left = Math.max(0, resets - t)
  const gone = Math.min(len, Math.max(0, len - left))
  const elapsed = gone / len
  const isAhead = w.pct >= 15 && w.pct / 100 > elapsed + 0.1
  let tail = `resets in ${dur(left)}`
  if (elapsed > 0.02 && w.pct > 0 && w.pct < 100) {
    const toFull = ((100 - w.pct) / w.pct) * gone
    if (toFull < left) tail = `full in ~${dur(toFull)}`
  }

  return { elapsed, isAhead, tail }
}

const barSvg = (
  pct: number,
  color: string,
  ticks: readonly number[],
  pace: number | undefined,
  isFaded: boolean,
  title: string,
): string => {
  const w = 88
  const x = (p: number) => ((Math.max(0, Math.min(100, p)) / 100) * w).toFixed(1)
  const tickMarks = ticks
    .map(p => `<rect x="${x(p)}" y="2" width="1" height="8" fill="${TRACK}"/>`)
    .join('')
  const paceMark =
    pace === undefined
      ? ''
      : `<path d="M ${x(pace * 100)} 3 l -3 -3 h 6 z" fill="${TRACK}"/><rect x="${x(pace * 100)}" y="2" width="1.5" height="9" fill="${TRACK}"/>`

  return `<svg xmlns="${NS}" width="${w}" height="12" viewBox="0 0 ${w} 12"><title>${title}</title><g opacity="${isFaded ? 0.4 : 1}"><rect x="0" y="4" width="${w}" height="5" rx="2.5" fill="${TRACK}" fill-opacity="0.3"/><rect x="0" y="4" width="${x(pct)}" height="5" rx="2.5" fill="${color}"/>${tickMarks}${paceMark}</g></svg>`
}

// The ring drains over what is left of the prompt cache's 5 minutes, with CSS
// inside the Svg, so it needs no redraws; its still frame is correct too.
const ringSvg = (left: number, isFaded: boolean, title: string): string => {
  const c = 25.13
  const frac = Math.max(0, Math.min(1, left / CACHE_MS))
  const start = (c * (1 - frac)).toFixed(2)
  const secs = Math.max(1, Math.round(left / 1000))
  const color = frac > 0.2 ? GOOD : frac > 0 ? WARN : TRACK
  const anim =
    frac > 0
      ? `<style>@keyframes drain { from { stroke-dashoffset: ${start}; } to { stroke-dashoffset: ${c}; } } .arc { animation: drain ${secs}s linear forwards; }</style>`
      : ''

  return `<svg xmlns="${NS}" width="12" height="12" viewBox="0 0 12 12"><title>${title}</title>${anim}<g opacity="${isFaded ? 0.4 : 1}"><circle cx="6" cy="6" r="4" fill="none" stroke="${TRACK}" stroke-opacity="0.35" stroke-width="2"/><circle class="arc" cx="6" cy="6" r="4" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${c}" stroke-dashoffset="${start}" transform="rotate(-90 6 6)"/></g></svg>`
}

// Window edges in the zone color: a vignette plus a thin frame.
const edgeSvg = (color: string): string =>
  `<svg xmlns="${NS}" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="${color}" stop-opacity="0"/><stop offset="100%" stop-color="${color}" stop-opacity="0.65"/></radialGradient></defs><rect width="100" height="100" fill="url(#v)"/><rect x="0" y="0" width="100" height="100" fill="none" stroke="${color}" stroke-width="8" stroke-opacity="0.85" vector-effect="non-scaling-stroke"/></svg>`

const textBar = (pct: number): string => {
  const n = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 8)

  return '▰'.repeat(n) + '▱'.repeat(8 - n)
}

// Only clears a theme this mod set, and stops tinting for the session once
// another plugin sets one ('yielded'): the band's border carries the tint then.
let isOwnSet = false

const applyTint = async ($: EngineInterface): Promise<void> => {
  const current = await read($, tint)
  if (current === 'yielded') return
  const p = await read($, prefs)
  const pct = (await read($, meter))?.ctxPct
  // No reading (a fresh window, a compaction): keep what stands.
  const want: Tint = !p.tint
    ? 'none'
    : pct === undefined
      ? current
      : pct >= 80
        ? 'edge-80'
        : pct >= 60
          ? 'edge-60'
          : 'none'
  if (want === current) return
  isOwnSet = true
  try {
    if (want === 'none') {
      await $.theme.clear()
    } else {
      await $.theme.set({
        backdrop: { scene: want, glass: { blur: 16, opacity: 0.55 } },
      })
    }
  } finally {
    isOwnSet = false
  }
  await update($, tint, () => want)
}

const togglePref = async ($: EngineInterface, key: keyof Prefs): Promise<void> => {
  await update($, prefs, p => ({ ...p, [key]: !p[key] }))
  await $.store.set('prefs', await read($, prefs))
  if (key === 'tint') await applyTint($)
}

const paceToast = (
  $: EngineInterface,
  label: string,
  w: LimitWindow | undefined,
  len: number,
  t: number,
  warned: string | undefined,
  isOn: boolean,
): string | undefined => {
  if (w === undefined) return warned
  const pace = paceOf(w, len, t)
  if (pace === null || !pace.isAhead || warned === w.resetsAt) return warned
  if (isOn) {
    $.ui.toast(
      `${label} limit is ahead of pace: ${w.pct}% used with ${Math.round(pace.elapsed * 100)}% of the window gone (${pace.tail}).`,
      { timeoutMs: 10_000 },
    )
  }

  return w.resetsAt
}

const checkToasts = async ($: EngineInterface, m: Meter, t: number): Promise<void> => {
  const p = await read($, prefs)
  const f = await read($, flags)
  let ctx80 = f.ctx80
  const pct = m.ctxPct
  if (pct !== undefined && pct >= 80 && !ctx80) {
    ctx80 = true
    if (p.toastContext) {
      $.ui.toast(
        `Context ${pct}%: hand-off zone. Press "Write handoff" in the strip to carry this chat into a fresh one.`,
        { timeoutMs: 12_000 },
      )
    }
  } else if (pct !== undefined && pct < 75) {
    ctx80 = false
  }
  const paceFive = paceToast($, '5-hour', m.five, FIVE_MS, t, f.paceFive, p.toastPace)
  const paceSeven = paceToast($, '7-day', m.seven, SEVEN_MS, t, f.paceSeven, p.toastPace)
  await update($, flags, () => ({ ctx80, paceFive, paceSeven, stale: false }))
}

const tick = async ($: EngineInterface): Promise<void> => {
  const t = await $.clock.now()
  await update($, now, () => t)
  const m = await read($, meter)
  if (m === null) return
  const age = t - m.measuredAt
  if (age <= STALE_MS || (await read($, flags)).stale) return
  await update($, flags, f => ({ ...f, stale: true }))
  if ((await read($, prefs)).toastStale) {
    $.ui.toast(
      `Usage figures are ${dur(age)} old: they refresh when this chat gets a reply.`,
    )
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const stored = await $.store.get('prefs')
    const saved = typeof stored === 'object' && stored !== null ? (stored as Partial<Prefs>) : {}
    await update($, prefs, () => ({ ...DEFAULT_PREFS, ...saved }))
    const t = await $.clock.now()
    await update($, now, () => t)
    // A reload keeps the last reading; a new session seeds one from the
    // status line's figures, if the engine has any yet.
    if ((await read($, meter)) === null) {
      const u = await $.session.usage()
      const five = u.rateLimits.find(r => r.kind === 'five_hour')
      const seven = u.rateLimits.find(r => r.kind === 'seven_day')
      if (u.context.percent !== undefined || five !== undefined || seven !== undefined) {
        await update($, meter, () => ({
          ctxPct: u.context.percent,
          ctxTokens: u.context.tokens,
          ctxWindow: u.context.window,
          five: five && { pct: five.percentUsed, resetsAt: five.resetsAt },
          seven: seven && { pct: seven.percentUsed, resetsAt: seven.resetsAt },
          measuredAt: t,
        }))
      }
    }
    // A timer stops at a hot reload; session.start runs again then.
    $.clock.every(30_000, () => {
      void tick($)
    })
    await applyTint($)
    void runProbe($)

    return ran
  })

  on('session.measure', async ($, e, next) => {
    const ran = await next(e)
    const t = await $.clock.now()
    const prev = await read($, meter)
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    const seven = e.rateLimits.find(r => r.kind === 'seven_day')
    const m: Meter = {
      ctxPct: e.context.percent,
      ctxTokens: e.context.tokens,
      ctxWindow: e.context.window,
      five: five ? { pct: five.percentUsed, resetsAt: five.resetsAt } : prev?.five,
      seven: seven ? { pct: seven.percentUsed, resetsAt: seven.resetsAt } : prev?.seven,
      model: await $.session.model(),
      measuredAt: t,
    }
    await update($, meter, () => m)
    // A reply just came back, so the prompt cache was used now (an estimate:
    // the last request started a little earlier, and eviction can't be seen).
    await update($, lastReplyAt, () => t)
    await update($, now, () => t)
    await checkToasts($, m, t)
    await applyTint($)

    return ran
  })

  // Another plugin's look wins: stop setting the backdrop for this session.
  // An observer only: if it fails, the other plugin's set still goes through.
  on('theme.set', async ($, e, next) => {
    if (!isOwnSet) await update($, tint, () => 'yielded' as Tint)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const isOurs = e.props.plugin === $.plugin.name
    const isEdge = e.props.scene === 'edge-60' || e.props.scene === 'edge-80'
    if (!isOurs || !isEdge || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const color = e.props.scene === 'edge-80' ? SERIOUS : WARN

    return (
      <Svg
        source={edgeSvg(color)}
        alt={e.props.scene === 'edge-80' ? 'Orange window edge: context past 80%' : 'Amber window edge: context past 60%'}
      />
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const m = await read($, meter)
    const t = Math.max(await read($, now), await $.clock.now())
    const p = await read($, prefs)
    const isOpen = await read($, showSettings)
    const replyAt = await read($, lastReplyAt)
    const probed = await read($, probe)
    const cols = e.props.bodyColumns

    const settings = (
      <Button
        key="settings"
        plain
        label={isOpen ? 'Done' : '⚙'}
        onPress={() => update($, showSettings, v => !v)}
      />
    )
    const settingsRow = isOpen && (
      <Box flexDirection="row" gap="sm" flexWrap="wrap">
        <Text dimColor>Toasts:</Text>
        <Button
          key="t-context"
          plain
          label={`${p.toastContext ? '☑' : '☐'} context 80%`}
          onPress={() => togglePref($, 'toastContext')}
        />
        <Button
          key="t-pace"
          plain
          label={`${p.toastPace ? '☑' : '☐'} ahead of pace`}
          onPress={() => togglePref($, 'toastPace')}
        />
        <Button
          key="t-stale"
          plain
          label={`${p.toastStale ? '☑' : '☐'} stale data`}
          onPress={() => togglePref($, 'toastStale')}
        />
        <Text dimColor>Look:</Text>
        <Button
          key="t-tint"
          plain
          label={`${p.tint ? '☑' : '☐'} edge tint`}
          onPress={() => togglePref($, 'tint')}
        />
        <Text dimColor>
          Desktop tools: {probed === null ? 'not checked yet' : probed.isOk ? `✓ ${probed.note}` : `✗ ${probed.note}`}
        </Text>
        <Text dimColor>Width: {cols} cols</Text>
      </Box>
    )

    if (m === null) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap="sm">
            <Text dimColor>Usage: waiting for this chat's first reply</Text>
            {settings}
          </Box>
          {settingsRow}
        </Box>
      )
    }

    const age = t - m.measuredAt
    const isFaded = age > STALE_MS
    const z = zoneOf(m.ctxPct)
    const zoneColor = isFaded ? undefined : z?.color
    const cacheLeft = replyAt === null ? undefined : CACHE_MS - (t - replyAt)
    const fivePace = m.five ? paceOf(m.five, FIVE_MS, t) : null
    const sevenPace = m.seven ? paceOf(m.seven, SEVEN_MS, t) : null
    const isEdge = p.tint && z !== null && (m.ctxPct ?? 0) >= 60

    const ctxTitle =
      m.ctxPct === undefined
        ? 'Context: no reading yet'
        : `Context ${m.ctxPct}% of ${Math.round(m.ctxWindow / 1000)}k tokens. Ticks at 60 and 80.`
    const cacheTitle =
      cacheLeft === undefined
        ? 'Prompt cache: no reply seen yet'
        : cacheLeft > 0
          ? `Prompt cache warm for about ${dur(cacheLeft)} more (estimate)`
          : 'Prompt cache likely expired: the next reply rereads the whole chat'

    const limit = (label: string, w: LimitWindow | undefined, pace: Pace | null) => {
      if (w === undefined) return null
      const color = isFaded
        ? undefined
        : w.pct >= 90
          ? SERIOUS
          : pace?.isAhead || w.pct >= 75
            ? WARN
            : undefined
      const mark = pace?.isAhead ? '▲ ' : ''

      return (
        <Box flexDirection="row" gap="xs" alignItems="center">
          {Svg ? (
            <Svg
              source={barSvg(
                w.pct,
                color ?? THINK,
                [],
                pace?.elapsed,
                isFaded,
                `${label} limit ${w.pct}%${pace ? `, ${Math.round(pace.elapsed * 100)}% of the window gone, ${pace.tail}` : ''}`,
              )}
              alt={`${label} limit ${w.pct}%`}
              width={88}
              height={12}
              isInteractive
            />
          ) : (
            <Text dimColor>{textBar(w.pct)}</Text>
          )}
          <Text color={color} dimColor={isFaded} wrap="truncate-end" maxLines={1}>
            {mark}
            {label} {w.pct}%
          </Text>
          {cols >= 80 && pace && (
            <Text dimColor wrap="truncate-end" maxLines={1}>
              {pace.tail}
            </Text>
          )}
        </Box>
      )
    }

    const row = (
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="nowrap">
        <Box flexDirection="row" gap="xs" alignItems="center">
          {Svg ? (
            <Svg
              source={barSvg(m.ctxPct ?? 0, z?.color ?? TRACK, [60, 80], undefined, isFaded, ctxTitle)}
              alt={ctxTitle}
              width={88}
              height={12}
              isInteractive
            />
          ) : (
            <Text dimColor>{textBar(m.ctxPct ?? 0)}</Text>
          )}
          <Text color={zoneColor} dimColor={isFaded} bold maxLines={1}>
            {z ? `${z.glyph} ${m.ctxPct}%` : 'ctx –'}
          </Text>
          {cols >= 70 && z && (
            <Text color={zoneColor} dimColor={isFaded} maxLines={1}>
              {z.name}
            </Text>
          )}
        </Box>
        <Box flexDirection="row" gap="xs" alignItems="center">
          {Svg && cacheLeft !== undefined && (
            <Svg
              source={ringSvg(cacheLeft, isFaded, cacheTitle)}
              alt={cacheTitle}
              width={12}
              height={12}
              isInteractive
            />
          )}
          {cols >= 85 && (
            <Text dimColor maxLines={1}>
              {cacheLeft === undefined ? 'cache –' : cacheLeft > 0 ? `cache ${dur(cacheLeft)}` : 'cache cold'}
            </Text>
          )}
        </Box>
        {limit('5h', m.five, fivePace)}
        {limit('7d', m.seven, sevenPace)}
        {cols >= 120 && m.model !== undefined && (
          <Text dimColor maxLines={1} wrap="truncate-end">
            {m.model}
          </Text>
        )}
        {isFaded && (
          <Text dimColor maxLines={1}>
            {dur(age)} old
          </Text>
        )}
        {(m.ctxPct ?? 0) >= 80 && (
          <Button
            key="handoff"
            variant="primary"
            label="Write handoff"
            onPress={() => $.prompt.submit({ text: HANDOFF_PROMPT })}
          />
        )}
        {settings}
      </Box>
    )

    return isEdge ? (
      <Box flexDirection="column" borderStyle="round" borderColor={z.color}>
        {row}
        {settingsRow}
      </Box>
    ) : (
      <Box flexDirection="column">
        {row}
        {settingsRow}
      </Box>
    )
  })
}
