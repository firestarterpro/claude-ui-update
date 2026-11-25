import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type {
  Activity,
  BandView,
  ChatStatus,
  ChatsView,
  ChipPrefs,
  CtxMap,
  Effort,
  Flags,
  History,
  Hit,
  LimitWindow,
  Meter,
  Prefs,
  Sample,
  Seen,
  SessionRow,
  Tint,
  Todo,
  UsageDetail,
} from '../types'

// v1 items: 1 meter strip, 2 project chips, 3 projects drawer, 4 activity
// line, 6 usage history, 7 toasts, 8 edge tint, 10 effort picker, 11 All chats.
// Status is never color alone: each one has a glyph and a word.

const DEFAULT_PREFS: Prefs = {
  toastContext: true,
  toastPace: true,
  toastStale: false,
  toastDone: true,
  tint: true,
  chips: true,
  activity: true,
}
const NO_FLAGS: Flags = { ctx80: false, stale: false }
const DEFAULT_CHIPS: ChipPrefs = { pinned: [], hidden: [], untilActive: [], count: 'auto', sort: 'recent' }
const NEW_CHATS: ChatsView = { tab: 'all', query: '', limit: 20 }
const IDLE: Activity = {
  phase: 'idle',
  tools: [],
  count: 0,
  byTool: {},
  agents: { running: 0, names: [] },
  todos: [],
}

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
  shape: 'prefs-2',
})
const flags = atom({ plugin: 'code-tab-hud', key: 'flags' } as const, NO_FLAGS, {
  shape: 'flags-1',
})
const showSettings = atom(
  { plugin: 'code-tab-hud', key: 'showSettings' } as const,
  false,
)
const tint = atom({ plugin: 'code-tab-hud', key: 'tint' } as const, 'none' as Tint)
const sessions = atom(
  { plugin: 'code-tab-hud', key: 'sessions' } as const,
  { rows: [], at: 0, asked: 0 },
  { shape: 'sessions-1' },
)
const self = atom({ plugin: 'code-tab-hud', key: 'self' } as const, null, {
  shape: 'self-1',
})
const seen = atom({ plugin: 'code-tab-hud', key: 'seen' } as const, { base: 0, at: {} }, {
  shape: 'seen-1',
})
const chats = atom({ plugin: 'code-tab-hud', key: 'chats' } as const, NEW_CHATS, {
  shape: 'chats-1',
})
const ctx = atom({ plugin: 'code-tab-hud', key: 'ctx' } as const, {}, {
  shape: 'ctx-1',
})
const chipPrefs = atom({ plugin: 'code-tab-hud', key: 'chipPrefs' } as const, DEFAULT_CHIPS, {
  shape: 'chips-1',
})
const band = atom({ plugin: 'code-tab-hud', key: 'band' } as const, {}, {
  shape: 'band-1',
})
const activity = atom({ plugin: 'code-tab-hud', key: 'activity' } as const, IDLE, {
  shape: 'activity-2',
})
const history = atom(
  { plugin: 'code-tab-hud', key: 'history' } as const,
  { samples: [], daily: {} },
  { shape: 'history-1' },
)
const usage = atom({ plugin: 'code-tab-hud', key: 'usage' } as const, null, {
  shape: 'usage-1',
})
const effort = atom({ plugin: 'code-tab-hud', key: 'effort' } as const, 'default' as Effort)

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

const CHATS = 'hud-chats'
const PROJECTS = 'hud-projects'
const USAGE = 'hud-usage'

const HANDOFF_PROMPT =
  'Write a handoff for this chat with the handoff skill, so a fresh chat can continue this work.'

const EFFORTS: readonly { value: Effort; label: string }[] = [
  { value: 'default', label: 'Chat default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
]

type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Link'>
type SvgEl = Elements['desktop']['Svg'] | undefined

const STATUS: Record<ChatStatus, { glyph: string; word: string; color: string | undefined }> = {
  thinking: { glyph: '◐', word: 'Thinking', color: THINK },
  done: { glyph: '✔', word: 'Done', color: GOOD },
  open: { glyph: '○', word: 'Open', color: undefined },
}

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

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const errText = (err: unknown): string =>
  clip(err instanceof Error ? err.message : String(err), 120)

// A short, stable address for a project's Buttons: its key may hold any text.
const hash = (s: string): string => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0

  return h.toString(36)
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))
const dayKey = (t: number): string => {
  const d = new Date(t)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const dayLabel = (ms: number, t: number): string => {
  if (ms === 0) return 'Earlier'
  const k = dayKey(ms)
  if (k === dayKey(t)) return 'Today'
  if (k === dayKey(t - DAY)) return 'Yesterday'

  return new Date(ms).toDateString().slice(0, 10)
}
const ago = (ms: number, t: number): string =>
  ms === 0 ? '' : t - ms < MIN ? 'now' : dur(t - ms)

// ---------------------------------------------------------------------------
// The desktop app's own tools ($.mcp.call): the chat list, usage, the sidebar.

// A tool answers text; the JSON may follow a line of prose.
const parseJson = (text: string): unknown => {
  const starts = [text.indexOf('['), text.indexOf('{')].filter(i => i >= 0)
  if (starts.length === 0) return undefined
  const a = Math.min(...starts)
  const b = text.lastIndexOf(text[a] === '[' ? ']' : '}')
  if (b <= a) return undefined
  try {
    return JSON.parse(text.slice(a, b + 1))
  } catch {
    return undefined
  }
}

const callTool = async (
  $: EngineInterface,
  server: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
  const r = await $.mcp.call(server, tool, args)
  const text = (r.content ?? []).map(b => (b.type === 'text' ? b.text : '')).join('\n')
  if (r.isError === true) throw new Error(text === '' ? `${tool} failed` : text)

  return parseJson(text)
}

// Only a claude:// link of plain characters is ever handed to the system.
const LINK_OK = /^claude:\/\/[A-Za-z0-9._~/-]{1,200}$/

const toRows = (raw: unknown): SessionRow[] => {
  if (!Array.isArray(raw)) return []
  const rows: SessionRow[] = []
  for (const item of raw) {
    const o = asRecord(item)
    const id = str(o?.sessionId)
    if (o === undefined || id === undefined || o.isArchived === true) continue
    const last = Date.parse(str(o.lastActivityAt) ?? '')
    const link = str(o.link)
    const prNumber = num(o.prNumber)
    const prState = str(o.prState)
    rows.push({
      id,
      title: clip(str(o.title) ?? 'Untitled chat', 200),
      cwd: str(o.cwd) ?? '',
      isRunning: o.isRunning === true,
      lastAt: Number.isNaN(last) ? 0 : last,
      link: link !== undefined && LINK_OK.test(link) ? link : undefined,
      group: str(asRecord(o.group)?.name),
      pr: prNumber === undefined ? undefined : `#${prNumber}${prState === undefined ? '' : ` ${prState}`}`,
    })
  }

  return rows
}

type UsageRead = {
  windows: UsageDetail['windows']
  categories: UsageDetail['categories']
  ctxPct?: number
  ctxTokens?: number
  ctxWindow?: number
}

const readUsage = (raw: unknown): UsageRead => {
  const o = asRecord(raw)
  const plan = asRecord(o?.plan)
  const context = asRecord(o?.context)
  const windows: UsageDetail['windows'] = []
  for (const item of Array.isArray(plan?.windows) ? plan.windows : []) {
    const w = asRecord(item)
    const label = str(w?.label)
    const pct = num(w?.percentUsed)
    if (label !== undefined && pct !== undefined) {
      windows.push({ label: clip(label, 60), pct, resetsAt: str(w?.resetsAt) })
    }
  }
  const categories: UsageDetail['categories'] = []
  const isOk = context?.status === 'ok'
  for (const item of isOk && Array.isArray(context?.categories) ? context.categories : []) {
    const c = asRecord(item)
    const name = str(c?.name)
    const tokens = num(c?.tokens)
    if (name !== undefined && tokens !== undefined) {
      categories.push({ name: clip(name, 40), tokens, percent: num(c?.percent) ?? 0 })
    }
  }

  return {
    windows,
    categories: categories.slice(0, 12),
    ctxPct: isOk ? num(context?.percentUsed) : undefined,
    ctxTokens: isOk ? num(context?.tokensUsed) : undefined,
    ctxWindow: isOk ? num(context?.contextWindow) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Chats, their status, and the projects they group into.

type World = {
  rows: SessionRow[]
  selfId: string | undefined
  selfPct: number | undefined
  seen: Seen
  ctx: CtxMap
  t: number
}

const loadWorld = async ($: EngineInterface): Promise<World> => {
  const list = await read($, sessions)
  const me = await read($, self)
  const act = await read($, activity)
  const t = Math.max(await read($, now), await $.clock.now())
  const rows: SessionRow[] = [...list.rows]
  if (me !== null && !rows.some(r => r.id === me.id)) {
    const isRunning = act.phase !== 'idle'
    const replied = await read($, lastReplyAt)
    rows.push({ ...me, isRunning, lastAt: isRunning ? t : Math.max(me.lastAt, replied ?? 0) })
  }
  rows.sort((a, b) => b.lastAt - a.lastAt)

  return {
    rows,
    selfId: me?.id,
    selfPct: (await read($, meter))?.ctxPct,
    seen: await read($, seen),
    ctx: await read($, ctx),
    t,
  }
}

const statusOf = (w: World, r: SessionRow): ChatStatus => {
  if (r.isRunning) return 'thinking'
  if (r.id === w.selfId) return 'open'

  return r.lastAt > Math.max(w.seen.at[r.id] ?? 0, w.seen.base) ? 'done' : 'open'
}

const ctxOf = (w: World, id: string): number | undefined =>
  id === w.selfId ? w.selfPct : w.ctx[id]?.pct

// A project is the chat's sidebar group when it has one, else its folder.
const keyOf = (r: SessionRow): string => r.group ?? (r.cwd === '' ? 'No folder' : r.cwd)
const nameOf = (key: string): string => {
  const parts = key.split(/[\\/]/).filter(s => s !== '')

  return clip(parts[parts.length - 1] ?? key, 28)
}

type Project = {
  key: string
  name: string
  rows: SessionRow[]
  thinking: number
  done: number
  open: number
  hot: number | undefined
  lastAt: number
}

const projectsOf = (w: World): Project[] => {
  const map = new Map<string, Project>()
  for (const r of w.rows) {
    const key = keyOf(r)
    let p = map.get(key)
    if (p === undefined) {
      p = { key, name: nameOf(key), rows: [], thinking: 0, done: 0, open: 0, hot: undefined, lastAt: 0 }
      map.set(key, p)
    }
    p.rows.push(r)
    p[statusOf(w, r)] += 1
    const pct = ctxOf(w, r.id)
    if (pct !== undefined && (p.hot === undefined || pct > p.hot)) p.hot = pct
    if (r.lastAt > p.lastAt) p.lastAt = r.lastAt
  }

  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt)
}

const projectStatus = (p: Project): ChatStatus =>
  p.thinking > 0 ? 'thinking' : p.done > 0 ? 'done' : 'open'

const sortProjects = (list: readonly Project[], cp: ChipPrefs): Project[] => {
  const by =
    cp.sort === 'name'
      ? (a: Project, b: Project) => a.name.localeCompare(b.name)
      : cp.sort === 'hot'
        ? (a: Project, b: Project) => (b.hot ?? -1) - (a.hot ?? -1)
        : (a: Project, b: Project) => b.lastAt - a.lastAt
  const rank = (p: Project) => {
    const i = cp.pinned.indexOf(p.key)

    return i < 0 ? cp.pinned.length : i
  }

  return [...list].sort((a, b) => rank(a) - rank(b) || by(a, b))
}

// The chips in order; a hidden project is left out, one "hidden until active"
// comes back while a chat of it is thinking or done.
const chipOrder = (list: readonly Project[], cp: ChipPrefs): Project[] =>
  sortProjects(
    list.filter(
      p => !cp.hidden.includes(p.key) && (!cp.untilActive.includes(p.key) || p.thinking + p.done > 0),
    ),
    cp,
  )

const chipFit = (cp: ChipPrefs, cols: number): number =>
  cp.count === 'auto' ? clamp(Math.floor((cols - 14) / 24), 1, 9) : Number(cp.count)

const countsText = (p: { thinking: number; done: number; open: number }): string =>
  [
    p.thinking > 0 ? `◐ ${p.thinking} thinking` : '',
    p.done > 0 ? `✔ ${p.done} done` : '',
    p.open > 0 ? `○ ${p.open} open` : '',
  ]
    .filter(s => s !== '')
    .join(' · ')

// The saved switches over the defaults; anything that is not a known switch is dropped.
const asPrefs = (v: unknown): Prefs => {
  const o = asRecord(v) ?? {}
  const next: Prefs = { ...DEFAULT_PREFS }
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const saved = o[key]
    if (typeof saved === 'boolean') next[key] = saved
  }

  return next
}

const asSeen = (v: unknown): Seen | undefined => {
  const o = asRecord(v)
  const base = num(o?.base)
  const at = asRecord(o?.at)
  if (base === undefined || at === undefined) return undefined
  const clean: Record<string, number> = {}
  for (const [k, stamp] of Object.entries(at)) {
    if (typeof stamp === 'number') clean[k] = stamp
  }

  return { base, at: clean }
}

// Every chat's copy of the mod writes the same store, so a write merges with
// what is there: the later stamp of each chat wins.
const markSeen = async ($: EngineInterface, ids: readonly string[] | 'all'): Promise<void> => {
  const t = await $.clock.now()
  const cur = await read($, seen)
  const stored = asSeen(await $.store.get('seen'))
  // A stamp is never older than the chat's own last activity, whatever the clocks say.
  const rows = (await read($, sessions)).rows
  const lastOf = (id: string) => rows.find(r => r.id === id)?.lastAt ?? 0
  let next: Seen
  if (ids === 'all') {
    next = { base: Math.max(t, ...rows.map(r => r.lastAt)), at: {} }
  } else {
    const at: Record<string, number> = { ...(stored?.at ?? {}) }
    for (const [k, stamp] of Object.entries(cur.at)) at[k] = Math.max(at[k] ?? 0, stamp)
    for (const id of ids) at[id] = Math.max(t, lastOf(id))
    const base = Math.max(cur.base, stored?.base ?? 0)
    const kept = Object.entries(at)
      .filter(([, stamp]) => stamp >= base)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 300)
    next = { base, at: Object.fromEntries(kept) }
  }
  await update($, seen, () => next)
  await $.store.set('seen', next)
}

// A chat that is on screen has been seen: its own copy of the mod stamps it
// (every two minutes while it shows, and when its turn ends), and every copy
// picks up the stamps and switches the others saved.
let lastSelfSeenAt = 0

const checkWindow = async ($: EngineInterface, isForced: boolean): Promise<void> => {
  let layout: Record<string, unknown> | undefined
  try {
    layout = asRecord(await callTool($, 'ccd_window', 'get_window_layout', {}))
  } catch {
    return
  }
  const isHidden = asRecord(layout?.main_window)?.sidebar_collapsed
  if (typeof isHidden === 'boolean' && ((await read($, band)).isSidebarHidden ?? false) !== isHidden) {
    await update($, band, v => ({ ...v, isSidebarHidden: isHidden }))
  }
  const me = await read($, self)
  if (me === null || asRecord(layout?.this_session)?.on_screen !== true) return
  const t = await $.clock.now()
  if (!isForced && t - lastSelfSeenAt < 2 * MIN) return
  // A forced stamp (the turn just ended) leaves the timer alone, so the next
  // tick stamps again, after the app has recorded the turn's last activity.
  if (!isForced) lastSelfSeenAt = t
  await markSeen($, [me.id])
}

const syncStore = async ($: EngineInterface): Promise<void> => {
  const stored = asSeen(await $.store.get('seen'))
  const cur = await read($, seen)
  if (stored !== undefined) {
    const base = Math.max(cur.base, stored.base)
    const at: Record<string, number> = {}
    for (const [k, stamp] of [...Object.entries(cur.at), ...Object.entries(stored.at)]) {
      if (stamp >= base) at[k] = Math.max(at[k] ?? 0, stamp)
    }
    const next: Seen = { base, at }
    if (JSON.stringify(next) !== JSON.stringify(cur)) await update($, seen, () => next)
  }
  const chipsSaved = asRecord(await $.store.get('chips')) as Partial<ChipPrefs> | undefined
  if (chipsSaved !== undefined) {
    const next = { ...DEFAULT_CHIPS, ...chipsSaved }
    if (JSON.stringify(next) !== JSON.stringify(await read($, chipPrefs))) {
      await update($, chipPrefs, () => next)
    }
  }
  const prefsSaved = await $.store.get('prefs')
  if (asRecord(prefsSaved) !== undefined) {
    const next = asPrefs(prefsSaved)
    if (JSON.stringify(next) !== JSON.stringify(await read($, prefs))) {
      await update($, prefs, () => next)
      await applyTint($)
    }
  }
}

const noteFinished = async (
  $: EngineInterface,
  before: readonly SessionRow[],
  after: readonly SessionRow[],
): Promise<void> => {
  if (!(await read($, prefs)).toastDone) return
  const wasRunning = new Set(before.filter(r => r.isRunning).map(r => r.id))
  for (const r of after) {
    if (!r.isRunning && wasRunning.has(r.id)) {
      $.ui.toast(`✔ Done: ${clip(r.title, 70)}`, { timeoutMs: 8_000 })
    }
  }
}

const refreshSessions = async ($: EngineInterface): Promise<void> => {
  const t = await $.clock.now()
  const asked = Math.max(50, (await read($, chats)).limit + 30)
  try {
    const rows = toRows(await callTool($, 'ccd_session_mgmt', 'list_sessions', { limit: asked }))
    const prev = await read($, sessions)
    const isSame =
      prev.at !== 0 &&
      prev.error === undefined &&
      prev.asked === asked &&
      JSON.stringify(prev.rows) === JSON.stringify(rows)
    if (!isSame) await update($, sessions, () => ({ rows, at: t, asked }))
    if (prev.at !== 0) await noteFinished($, prev.rows, rows)
  } catch (err) {
    const error = errText(err)
    await update($, sessions, s => ({ ...s, at: t, error }))
  }
}

const refreshSelf = async ($: EngineInterface): Promise<void> => {
  try {
    const raw = await callTool($, 'ccd_session_mgmt', 'get_session', { session_id: 'self' })
    const row = toRows([raw])[0]
    if (row !== undefined) await update($, self, () => row)
  } catch {
    // No desktop app beneath (a terminal session): the list simply has no "this chat" row.
  }
}

// Another chat's context fill: asked only for the rows named, a few per call,
// and not again while its last answer is fresh. An idle chat reports none.
const refreshCtx = async ($: EngineInterface, ids: readonly string[]): Promise<void> => {
  const t = await $.clock.now()
  const have = await read($, ctx)
  const fresh: CtxMap = {}
  let asked = 0
  for (const id of ids) {
    const old = have[id]
    if (old !== undefined && t - old.at < (old.pct === undefined ? 10 * MIN : 2 * MIN)) continue
    if (asked >= 4) break
    asked += 1
    try {
      const u = readUsage(await callTool($, 'ccd_session_mgmt', 'get_usage', { session_id: id }))
      fresh[id] = { pct: u.ctxPct, at: t }
    } catch {
      fresh[id] = { at: t }
    }
  }
  if (asked === 0) return
  await update($, ctx, m => {
    const all = Object.entries({ ...m, ...fresh })
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 200)

    return Object.fromEntries(all)
  })
}

const refreshVisible = async ($: EngineInterface): Promise<void> => {
  const w = await loadWorld($)
  const view = await read($, chats)
  const open = (await read($, band)).project
  const others = w.rows.filter(r => r.id !== w.selfId)
  let isListShown = false
  try {
    isListShown = (await $.ui.panes()).some(p => p.id === CHATS && p.isShown)
  } catch {
    isListShown = false
  }
  // Thinking chats always (the chips show the fullest one); the rest only
  // while their rows are on screen.
  const ids = [
    ...others.filter(r => r.isRunning),
    ...others.filter(r => open !== undefined && keyOf(r) === open).slice(0, 6),
    ...(isListShown ? others.slice(0, view.limit) : []),
  ].map(r => r.id)
  await refreshCtx($, [...new Set(ids)])
}

const linkFor = (w: World, id: string): string | undefined => {
  const row = w.rows.find(r => r.id === id)
  if (row?.link !== undefined) return row.link
  const model = w.rows.find(r => r.link !== undefined && r.link.endsWith(r.id))
  if (model?.link === undefined) return undefined
  const link = model.link.slice(0, -model.id.length) + id

  return LINK_OK.test(link) ? link : undefined
}

// Switches the app to a chat by opening its claude:// link with the system,
// as a click on that link in another program would.
const openChat = async (
  $: EngineInterface,
  chat: { id: string; title: string; link?: string },
): Promise<boolean> => {
  await markSeen($, [chat.id])
  const title = clip(chat.title, 60)
  if (chat.link === undefined || !LINK_OK.test(chat.link)) {
    $.ui.toast(`"${title}" has no link to open. Pick it in the app's sidebar.`)

    return false
  }
  try {
    const sys = (await $.session.machine()).sysname
    const argv =
      sys === 'Windows_NT'
        ? ['rundll32.exe', 'url.dll,FileProtocolHandler', chat.link]
        : sys === 'Darwin'
          ? ['open', chat.link]
          : ['xdg-open', chat.link]
    const r = await $.process.run(argv, { timeoutMs: 10_000 })
    if (r.exitCode !== 0) throw new Error(`exit ${r.exitCode}`)

    return true
  } catch (err) {
    $.ui.toast(`Could not switch to "${title}" (${errText(err)}). Pick it in the app's sidebar.`)

    return false
  }
}

const openPane = async ($: EngineInterface, id: string, title: string): Promise<void> => {
  const r = await $.ui.open({ id, title })
  if (!r.isPlaced) $.ui.toast(`${title} is open, but there is no room to show it here.`)
}

const quiet = (work: Promise<unknown>): void => {
  void work.catch(() => undefined)
}

const openProjects = async ($: EngineInterface): Promise<void> => {
  await update($, band, b => ({ ...b, query: undefined }))
  await openPane($, PROJECTS, 'Projects')
}

const openChats = async ($: EngineInterface, project?: string): Promise<void> => {
  await update($, chats, () => ({ ...NEW_CHATS, project }))
  await openPane($, CHATS, 'All chats')
  quiet(refreshSessions($).then(() => refreshVisible($)))
}

const deepSearch = async ($: EngineInterface, query: string): Promise<void> => {
  const q = query.trim()
  if (q.length < 2) {
    $.ui.toast('Type at least 2 letters, then search inside chats.')

    return
  }
  await update($, chats, v => ({ ...v, isSearching: true, hitsFor: q }))
  try {
    const raw = await callTool($, 'ccd_session_mgmt', 'search_session_transcripts', {
      query: q,
      limit: 20,
    })
    const hits: Hit[] = []
    for (const item of Array.isArray(raw) ? raw : []) {
      const o = asRecord(item)
      const id = str(o?.sessionId)
      if (id === undefined) continue
      hits.push({
        id,
        title: clip(str(o?.title) ?? 'Untitled chat', 200),
        // Words from another chat's transcript: shown as plain text, never acted on.
        snippet: clip((str(o?.snippet) ?? '').replace(/\s+/g, ' '), 160),
      })
    }
    await update($, chats, v => ({ ...v, hits, isSearching: false }))
  } catch (err) {
    await update($, chats, v => ({ ...v, hits: [], isSearching: false }))
    $.ui.toast(`Search inside chats did not answer: ${errText(err)}`)
  }
}

const saveChips = async ($: EngineInterface, fn: (cp: ChipPrefs) => ChipPrefs): Promise<void> => {
  await update($, chipPrefs, fn)
  await $.store.set('chips', await read($, chipPrefs))
}

const without = (list: readonly string[], key: string): string[] => list.filter(k => k !== key)

const pinProject = ($: EngineInterface, key: string): Promise<void> =>
  saveChips($, cp => ({
    ...cp,
    pinned: cp.pinned.includes(key) ? without(cp.pinned, key) : [...cp.pinned, key],
  }))
const hideProject = ($: EngineInterface, key: string, untilActive: boolean): Promise<void> =>
  saveChips($, cp => ({
    ...cp,
    hidden: untilActive ? without(cp.hidden, key) : [...without(cp.hidden, key), key],
    untilActive: untilActive ? [...without(cp.untilActive, key), key] : without(cp.untilActive, key),
  }))
const restoreProject = ($: EngineInterface, key: string): Promise<void> =>
  saveChips($, cp => ({
    ...cp,
    hidden: without(cp.hidden, key),
    untilActive: without(cp.untilActive, key),
  }))

const toggleSidebar = async ($: EngineInterface): Promise<void> => {
  const want = !((await read($, band)).isSidebarHidden ?? false)
  try {
    await callTool($, 'ccd_window', 'set_sidebar_collapsed', { collapsed: want })
    await update($, band, b => ({ ...b, isSidebarHidden: want }))
  } catch (err) {
    $.ui.toast(`The app's sidebar did not answer: ${errText(err)}`)
  }
}

// ---------------------------------------------------------------------------
// Usage: pace, limit history, and the app's own usage figures.

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

const asHistory = (v: unknown): History => {
  const o = asRecord(v)
  const samples: Sample[] = []
  for (const item of Array.isArray(o?.samples) ? o.samples : []) {
    const s = asRecord(item)
    const t = num(s?.t)
    if (t !== undefined) samples.push({ t, five: num(s?.five), seven: num(s?.seven) })
  }
  const daily: History['daily'] = {}
  for (const [k, item] of Object.entries(asRecord(o?.daily) ?? {})) {
    const d = asRecord(item)
    daily[k] = { five: num(d?.five) ?? 0, seven: num(d?.seven) ?? 0 }
  }

  return { samples, daily }
}

const mergeHistory = (a: History, b: History, s: Sample): History => {
  const byTime = new Map<number, Sample>()
  for (const one of [...a.samples, ...b.samples, s]) {
    if (one.t >= s.t - 8 * DAY) byTime.set(one.t, one)
  }
  let samples = [...byTime.values()].sort((x, y) => x.t - y.t)
  // Past 600 readings the older half keeps every other one.
  if (samples.length > 600) {
    const half = Math.floor(samples.length / 2)
    samples = [...samples.slice(0, half).filter((_, i) => i % 2 === 0), ...samples.slice(half)]
  }
  const daily: History['daily'] = {}
  const keys = new Set([...Object.keys(a.daily), ...Object.keys(b.daily), dayKey(s.t)])
  for (const k of [...keys].sort().slice(-35)) {
    const today = k === dayKey(s.t) ? s : undefined
    daily[k] = {
      five: Math.max(a.daily[k]?.five ?? 0, b.daily[k]?.five ?? 0, today?.five ?? 0),
      seven: Math.max(a.daily[k]?.seven ?? 0, b.daily[k]?.seven ?? 0, today?.seven ?? 0),
    }
  }

  return { samples, daily }
}

const addSample = async (
  $: EngineInterface,
  t: number,
  five: number | undefined,
  seven: number | undefined,
): Promise<void> => {
  if (five === undefined && seven === undefined) return
  const cur = await read($, history)
  // Every chat feeds the same history: a reading another chat just saved counts.
  const stored = asHistory(await $.store.get('history'))
  const mine = cur.samples[cur.samples.length - 1]
  const theirs = stored.samples[stored.samples.length - 1]
  const last = mine !== undefined && (theirs === undefined || mine.t >= theirs.t) ? mine : theirs
  if (last !== undefined) {
    const isSame = last.five === five && last.seven === seven
    if (t - last.t < (isSame ? 5 * MIN : 30_000)) {
      if (stored.samples.length > cur.samples.length) {
        const caught = mergeHistory(stored, cur, last)
        await update($, history, () => caught)
      }

      return
    }
  }
  const merged = mergeHistory(stored, cur, { t, five, seven })
  await update($, history, () => merged)
  await $.store.set('history', merged)
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

  return `<svg xmlns="${NS}" width="${w}" height="12" viewBox="0 0 ${w} 12"><title>${esc(title)}</title><g opacity="${isFaded ? 0.4 : 1}"><rect x="0" y="4" width="${w}" height="5" rx="2.5" fill="${TRACK}" fill-opacity="0.3"/><rect x="0" y="4" width="${x(pct)}" height="5" rx="2.5" fill="${color}"/>${tickMarks}${paceMark}</g></svg>`
}

// A chip's underline: the context fill of the project's fullest chat.
const thinSvg = (pct: number, color: string, title: string): string =>
  `<svg xmlns="${NS}" width="28" height="6" viewBox="0 0 28 6"><title>${esc(title)}</title><rect x="0" y="1" width="28" height="4" rx="2" fill="${TRACK}" fill-opacity="0.3"/><rect x="0" y="1" width="${((clamp(pct, 0, 100) / 100) * 28).toFixed(1)}" height="4" rx="2" fill="${color}"/></svg>`

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

  return `<svg xmlns="${NS}" width="12" height="12" viewBox="0 0 12 12"><title>${esc(title)}</title>${anim}<g opacity="${isFaded ? 0.4 : 1}"><circle cx="6" cy="6" r="4" fill="none" stroke="${TRACK}" stroke-opacity="0.35" stroke-width="2"/><circle class="arc" cx="6" cy="6" r="4" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${c}" stroke-dashoffset="${start}" transform="rotate(-90 6 6)"/></g></svg>`
}

// Window edges in the zone color: a vignette plus a thin frame.
const edgeSvg = (color: string): string =>
  `<svg xmlns="${NS}" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="${color}" stop-opacity="0"/><stop offset="100%" stop-color="${color}" stop-opacity="0.65"/></radialGradient></defs><rect width="100" height="100" fill="url(#v)"/><rect x="0" y="0" width="100" height="100" fill="none" stroke="${color}" stroke-width="8" stroke-opacity="0.85" vector-effect="non-scaling-stroke"/></svg>`

type Burn = { svg: string; note: string }

// One limit window from its start to its reset: the readings as a line, even
// pace as a dashed diagonal, and where the line is heading.
const burnOf = (
  samples: readonly Sample[],
  pick: 'five' | 'seven',
  win: LimitWindow,
  len: number,
  t: number,
): Burn | null => {
  if (win.resetsAt === undefined) return null
  const reset = Date.parse(win.resetsAt)
  if (Number.isNaN(reset)) return null
  const start = reset - len
  const W = 300
  const H = 80
  const x = (ms: number) => clamp((ms - start) / len, 0, 1) * W
  const y = (p: number) => H - (clamp(p, 0, 100) / 100) * H
  const pts: [number, number][] = [[0, H]]
  for (const s of samples) {
    const v = s[pick]
    if (v !== undefined && s.t >= start && s.t <= t) pts.push([x(s.t), y(v)])
  }
  pts.push([x(t), y(win.pct)])
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const gone = clamp(t - start, 0, len)
  let ahead = ''
  let note = 'No use yet in this window.'
  if (win.pct >= 100) {
    note = `Full now. Resets in ${dur(reset - t)}.`
  } else if (win.pct > 0 && gone > 0) {
    const fullAt = start + (gone * 100) / win.pct
    if (fullAt < reset) {
      ahead = `<line x1="${x(t).toFixed(1)}" y1="${y(win.pct).toFixed(1)}" x2="${x(fullAt).toFixed(1)}" y2="0" stroke="${SERIOUS}" stroke-width="1.5" stroke-dasharray="4 3"/><rect x="${(x(fullAt) - 0.75).toFixed(1)}" y="0" width="1.5" height="${H}" fill="${SERIOUS}"/><text x="${clamp(x(fullAt) + 4, 0, W - 24).toFixed(1)}" y="10" font-size="9" fill="${SERIOUS}">full</text>`
      note = `At this rate it is full in about ${dur(fullAt - t)}, ${dur(reset - fullAt)} before the reset.`
    } else {
      const end = (win.pct * len) / gone
      ahead = `<line x1="${x(t).toFixed(1)}" y1="${y(win.pct).toFixed(1)}" x2="${W}" y2="${y(end).toFixed(1)}" stroke="${THINK}" stroke-width="1.5" stroke-dasharray="4 3"/>`
      note = `At this rate it ends near ${Math.round(end)}% when it resets in ${dur(reset - t)}.`
    }
  }
  const svg = `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${TRACK}" stroke-opacity="0.5"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="${TRACK}" stroke-opacity="0.25"/><line x1="0" y1="${H}" x2="${W}" y2="0" stroke="${TRACK}" stroke-width="1" stroke-dasharray="2 3"/><polyline points="${line}" fill="none" stroke="${THINK}" stroke-width="2"/>${ahead}<circle cx="${x(t).toFixed(1)}" cy="${y(win.pct).toFixed(1)}" r="3" fill="${THINK}"/></svg>`

  return { svg, note }
}

const lastDays = (daily: History['daily'], t: number, n: number): { five: number; seven: number }[] =>
  Array.from({ length: n }, (_, i) => daily[dayKey(t - (n - 1 - i) * DAY)] ?? { five: 0, seven: 0 })

// The last 30 days, one bar a day: the day's highest 5-hour use, with a grey
// mark at its highest 7-day use.
const daysSvg = (daily: History['daily'], t: number): string => {
  const W = 300
  const H = 48
  const bw = W / 30
  const bars = lastDays(daily, t, 30)
    .map((d, i) => {
      const h = (clamp(d.five, 0, 100) / 100) * H
      const color = d.five >= 90 ? SERIOUS : d.five >= 75 ? WARN : THINK
      const mark =
        d.seven > 0
          ? `<rect x="${(i * bw).toFixed(1)}" y="${(H - (clamp(d.seven, 0, 100) / 100) * H).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="1.5" fill="${TRACK}"/>`
          : ''

      return `<rect x="${(i * bw).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>${mark}`
    })
    .join('')

  return `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="0" y="${H - 0.5}" width="${W}" height="0.5" fill="${TRACK}"/>${bars}</svg>`
}

const SPARK = '▁▂▃▄▅▆▇█'
const spark = (values: readonly number[]): string =>
  values.map(v => (v <= 0 ? '·' : SPARK[clamp(Math.ceil((v / 100) * 8) - 1, 0, 7)])).join('')

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
        backdrop: { scene: want, glass: GLASS },
      })
    }
  } finally {
    isOwnSet = false
  }
  await update($, tint, () => want)
}

const togglePref = async ($: EngineInterface, key: keyof Prefs): Promise<void> => {
  // Every chat shares the saved switches: flip this one on top of what is saved.
  const isOn = (await read($, prefs))[key]
  const next: Prefs = { ...asPrefs(await $.store.get('prefs')), [key]: !isOn }
  await update($, prefs, () => next)
  await $.store.set('prefs', next)
  if (key === 'tint') await applyTint($)
}

const isSameReset = (a: string | undefined, b: string | undefined): boolean => {
  if (a === undefined || b === undefined) return false
  if (a === b) return true
  const x = Date.parse(a)
  const y = Date.parse(b)

  return !Number.isNaN(x) && !Number.isNaN(y) && Math.abs(x - y) < 10 * MIN
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
  if (pace === null || !pace.isAhead || isSameReset(warned, w.resetsAt)) return warned
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

// The app's own usage figures for this chat: the limits (fresh even while the
// chat is idle), each model's weekly window, and what fills the context.
let lastUsageAt = 0

const refreshUsage = async ($: EngineInterface): Promise<void> => {
  const t = await $.clock.now()
  lastUsageAt = t
  let u: UsageRead
  try {
    u = readUsage(await callTool($, 'ccd_session_mgmt', 'get_usage', { session_id: 'self' }))
  } catch {
    return
  }
  if (u.windows.length === 0 && u.categories.length === 0) return
  await update($, usage, () => ({
    windows: u.windows,
    categories: u.categories,
    ctxPct: u.ctxPct,
    at: t,
  }))
  const pick = (re: RegExp): LimitWindow | undefined => {
    const w = u.windows.find(one => re.test(one.label))

    return w === undefined ? undefined : { pct: w.pct, resetsAt: w.resetsAt }
  }
  const five = pick(/5.?hour/i)
  const seven = pick(/weekly.*all/i)
  if (five === undefined && seven === undefined) return
  const prev = await read($, meter)
  const m: Meter = {
    ctxPct: prev?.ctxPct ?? u.ctxPct,
    ctxTokens: prev?.ctxTokens ?? u.ctxTokens,
    ctxWindow: prev?.ctxWindow ?? u.ctxWindow ?? 200_000,
    five: five ?? prev?.five,
    seven: seven ?? prev?.seven,
    model: prev?.model,
    measuredAt: t,
  }
  await update($, meter, () => m)
  await addSample($, t, m.five?.pct, m.seven?.pct)
  await checkToasts($, m, t)
  await applyTint($)
}

// ---------------------------------------------------------------------------
// What Claude is doing this turn, read from each step's answer.

const shortTool = (name: string): string => {
  const parts = name.split('__')

  return clip(parts[parts.length - 1] ?? name, 24)
}

const asStatus = (v: unknown): Todo['status'] =>
  v === 'completed' || v === 'in_progress' ? v : 'pending'

const todosFrom = (list: unknown, textKey: string): Todo[] | undefined => {
  if (!Array.isArray(list)) return undefined
  const todos: Todo[] = []
  for (const item of list) {
    const o = asRecord(item)
    const text = str(o?.[textKey])
    if (text !== undefined) todos.push({ text: clip(text, 80), status: asStatus(o?.status) })
  }

  return todos.slice(0, 30)
}

// The to-do tools this build knows: TodoWrite, the desktop's plan list, and
// the Task tools (their ids count up from 1 in a chat).
const applyTodo = (todos: readonly Todo[], use: { name: string; input: unknown }): Todo[] => {
  const input = asRecord(use.input) ?? {}
  const name = shortTool(use.name)
  if (name === 'TodoWrite') return todosFrom(input.todos, 'content') ?? [...todos]
  if (name === 'update_plan') {
    const whole = todosFrom(input.items, 'content')
    if (whole !== undefined) return whole
    const next = todos.map(one => ({ ...one }))
    for (const n of Array.isArray(input.done) ? input.done : []) {
      const one = typeof n === 'number' ? next[n - 1] : undefined
      if (one !== undefined) one.status = 'completed'
    }
    if (input.advance === true) {
      const at = next.findIndex(one => one.status === 'in_progress')
      const cur = next[at]
      if (cur !== undefined) cur.status = 'completed'
      const up = next.find(one => one.status === 'pending')
      if (up !== undefined) up.status = 'in_progress'
    }
    const start = typeof input.start === 'number' ? next[input.start - 1] : undefined
    if (start !== undefined) start.status = 'in_progress'

    return next
  }
  if (name === 'TaskCreate') {
    const subject = str(input.subject)

    return subject === undefined
      ? [...todos]
      : todos.length >= 60
        ? [...todos]
        : [...todos, { text: clip(subject, 80), status: 'pending' as const }]
  }
  if (name === 'TaskUpdate') {
    const at = Number(str(input.taskId) ?? num(input.taskId)) - 1
    const status = str(input.status)

    return todos.map((one, i) =>
      i === at && (status === 'pending' || status === 'in_progress' || status === 'completed')
        ? { ...one, status }
        : one,
    )
  }

  return [...todos]
}

const noteStep = async (
  $: EngineInterface,
  uses: readonly { name: string; input: unknown }[],
): Promise<void> => {
  let agents: Activity['agents'] | undefined
  try {
    const live = (await $.agent.list()).filter(
      a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting',
    )
    agents = { running: live.length, names: live.slice(0, 3).map(a => clip(a.type, 20)) }
  } catch {
    agents = undefined
  }
  await update($, activity, a => {
    const byTool = { ...a.byTool }
    for (const u of uses) {
      const name = shortTool(u.name)
      byTool[name] = (byTool[name] ?? 0) + 1
      if (name === 'update_plan') isPlanList = true
      else if (name === 'TodoWrite' || name === 'TaskCreate') isPlanList = false
    }

    return {
      ...a,
      phase: uses.length > 0 ? ('tool' as const) : ('model' as const),
      tools: uses.length > 0 ? [...new Set(uses.map(u => shortTool(u.name)))].slice(0, 3) : a.tools,
      count: a.count + uses.length,
      byTool,
      agents: agents ?? a.agents,
      todos: uses.reduce<Todo[]>(applyTodo, [...a.todos]),
    }
  })
}

// True while the to-do list came from the desktop's plan tool.
let isPlanList = false

// True while a picked effort met a step that reports none (a model without
// effort levels): said once, when the turn ends.
let isEffortMissed = false

// ---------------------------------------------------------------------------
// The 30-second tick.

let isTicking = false

const tick = async ($: EngineInterface): Promise<void> => {
  if (isTicking) return
  isTicking = true
  try {
    const t = await $.clock.now()
    await update($, now, () => t)
    const m = await read($, meter)
    if (m !== null) {
      const age = t - m.measuredAt
      if (age > STALE_MS && !(await read($, flags)).stale) {
        await update($, flags, f => ({ ...f, stale: true }))
        if ((await read($, prefs)).toastStale) {
          $.ui.toast(
            `Usage figures are ${dur(age)} old: they refresh when this chat gets a reply.`,
          )
        }
      }
    }
    await syncStore($)
    await checkWindow($, false)
    await refreshSessions($)
    await refreshVisible($)
    let isUsageOpen = false
    try {
      isUsageOpen = (await $.ui.panes()).some(p => p.id === USAGE && p.isShown)
    } catch {
      isUsageOpen = false
    }
    if ((await read($, self)) === null || t - lastUsageAt >= 5 * MIN) await refreshSelf($)
    if (isUsageOpen || t - lastUsageAt >= 5 * MIN) await refreshUsage($)
  } catch {
    // A tick that fails is dropped: the next one starts clean.
  } finally {
    isTicking = false
  }
}

const boot = async ($: EngineInterface): Promise<void> => {
  try {
    await refreshSelf($)
    await refreshSessions($)
    await refreshUsage($)
    await refreshVisible($)
  } catch {
    // Without the desktop app's tools the strip still works from the engine's figures.
  }
}

// ---------------------------------------------------------------------------
// Drawing.

const chatRow = ($: EngineInterface, els: Els, w: World, r: SessionRow, withProject: boolean) => {
  const { Box, Button, Text } = els
  const st = statusOf(w, r)
  const s = STATUS[st]
  const pct = ctxOf(w, r.id)
  const tail = [
    withProject ? nameOf(keyOf(r)) : '',
    r.pr ?? '',
    pct === undefined ? '' : `context ${pct}%`,
    ago(r.lastAt, w.t),
  ]
    .filter(x => x !== '')
    .join(' · ')
  const title = clip(r.title, 64)

  return (
    <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
      <Text color={s.color} bold={st !== 'open'} dimColor={st === 'open'}>
        {`${s.glyph} ${s.word}`}
      </Text>
      {r.id === w.selfId ? (
        <Text bold>{title}</Text>
      ) : (
        <Button
          key={`c-${r.id}`}
          plain
          label={st === 'done' ? `● ${title}` : title}
          onPress={() => openChat($, r)}
        />
      )}
      <Text dimColor>{r.id === w.selfId ? `this chat · ${tail}` : tail}</Text>
    </Box>
  )
}

const usageRow = (els: Els, Svg: SvgEl, label: string, pct: number, tail: string, color: string) => {
  const { Box, Text } = els

  return (
    <Box flexDirection="row" gap="sm" alignItems="center">
      {Svg ? (
        <Svg source={barSvg(pct, color, [], undefined, false, label)} alt={`${label}: ${pct}%`} width={88} height={12} />
      ) : (
        <Text color={color}>{textBar(pct)}</Text>
      )}
      <Text bold>{`${pct}%`}</Text>
      <Text>{label}</Text>
      <Text dimColor>{tail}</Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const savedPrefs = asPrefs(await $.store.get('prefs'))
    await update($, prefs, () => savedPrefs)
    const chipsSaved = asRecord(await $.store.get('chips')) as Partial<ChipPrefs> | undefined
    await update($, chipPrefs, () => ({ ...DEFAULT_CHIPS, ...(chipsSaved ?? {}) }))
    const t = await $.clock.now()
    await update($, now, () => t)
    // The first run stamps "seen" now: chats that finished before the mod
    // arrived read Open, not Done.
    const seenSaved = asSeen(await $.store.get('seen'))
    if (seenSaved === undefined) {
      const first: Seen = { base: t, at: {} }
      await update($, seen, () => first)
      await $.store.set('seen', first)
    } else {
      await update($, seen, () => seenSaved)
    }
    const kept = asHistory(await $.store.get('history'))
    await update($, history, () => kept)
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
    try {
      await $.command.register({
        name: 'jump',
        description: 'Jump to a project chip by its number, or to a chat by name',
        argumentHint: '[number or name]',
      })
      await $.command.register({
        name: 'chats',
        description: 'Open the All chats list',
      })
    } catch {
      // The strip's buttons do the same without the commands.
    }
    // A timer stops at a hot reload; session.start runs again then.
    $.clock.every(30_000, () => {
      void tick($)
    })
    // A theme does not outlive the mod's unload: set the scene again on every load.
    if ((await read($, tint)) !== 'yielded') await update($, tint, () => 'none' as Tint)
    await applyTint($)
    void boot($)

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
    if (e.changed.includes('context')) await update($, lastReplyAt, () => t)
    await update($, now, () => t)
    await addSample($, t, m.five?.pct, m.seven?.pct)
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

  // The main loop's turn: the activity line follows it. A subagent's turn
  // (agentId) is left alone.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const turnId = e.turnId
      // The picked effort is armed for this turn alone; a pick made while a
      // turn runs waits for the next one.
      const pick = await read($, effort)
      const level = pick === 'default' ? undefined : pick
      await update($, activity, a => ({
        ...IDLE,
        // A finished list is dropped; an unfinished one carries on.
        todos: a.todos.some(one => one.status !== 'completed') ? a.todos : [],
        turnId,
        phase: 'model' as const,
        effort: level,
      }))
      if (level !== undefined) await update($, effort, () => 'default' as Effort)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    let pick: Activity['effort']
    try {
      const act = await read($, activity)
      pick = act.turnId === e.turnId ? act.effort : undefined
      if (act.phase !== 'model') {
        await update($, activity, a => ({ ...a, phase: 'model' as const }))
      }
    } catch {
      pick = undefined
    }
    // The armed effort rides on each step of its turn, on a model that
    // reports an effort level; the chat's own setting is never changed.
    const level = e.effort === undefined ? undefined : pick
    if (pick !== undefined && level === undefined) isEffortMissed = true
    const r = yield* next(level === undefined ? e : { ...e, effort: level })
    try {
      // A reply of this chat just came back: its prompt cache was used now.
      if (r.usage !== null) {
        const t = await $.clock.now()
        await update($, lastReplyAt, () => t)
      }
      await noteStep($, r.toolUses)
    } catch {
      // The line is a convenience: the step's answer goes on untouched.
    }

    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      // The app checks off a plan's last step when the turn ends with an answer.
      const isPlanDone = isPlanList && e.reason === 'answer'
      await update($, activity, a => ({
        ...a,
        phase: 'idle' as const,
        tools: [],
        effort: undefined,
        todos: isPlanDone
          ? a.todos.map(one => (one.status === 'in_progress' ? { ...one, status: 'completed' as const } : one))
          : a.todos,
      }))
      if (isEffortMissed) {
        $.ui.toast('This model reports no effort level, so the effort pick changed nothing.')
      }
      isEffortMissed = false
      quiet(checkWindow($, true))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, meter, m => (m === null ? m : { ...m, ctxPct: undefined, ctxTokens: undefined }))
      await update($, lastReplyAt, () => null)
      await update($, flags, () => NO_FLAGS)
      await update($, activity, () => IDLE)
      const standing = await read($, tint)
      if (standing === 'edge-60' || standing === 'edge-80') {
        isOwnSet = true
        try {
          await $.theme.clear()
        } finally {
          isOwnSet = false
        }
        await update($, tint, () => 'none' as Tint)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'chats' }, async $ => {
    await openChats($)

    return { text: 'All chats opened.' }
  })

  on('command.run', { command: 'jump' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    await refreshSessions($)
    const w = await loadWorld($)
    const others = (p: Project) => p.rows.filter(r => r.id !== w.selfId)
    const order = chipOrder(projectsOf(w), await read($, chipPrefs)).filter(p => others(p).length > 0)
    if (arg === '') {
      const lines = order
        .slice(0, 9)
        .map((p, i) => `${i + 1}  ${p.name}  ${countsText(p)}`)

      return {
        text:
          lines.length === 0
            ? 'No other chats to jump to yet.'
            : `Type /jump and a number or part of a name.\n${lines.join('\n')}`,
      }
    }
    let target: SessionRow | undefined
    if (/^[1-9]$/.test(arg)) {
      const p = order[Number(arg) - 1]
      // A project's finished chat first, then its newest.
      target = p && (others(p).find(r => statusOf(w, r) === 'done') ?? others(p)[0])
    } else {
      const q = arg.toLowerCase()
      target =
        w.rows.find(r => r.id !== w.selfId && r.title.toLowerCase().includes(q)) ??
        order.filter(p => p.name.toLowerCase().includes(q)).flatMap(others)[0]
    }
    if (target === undefined) return { text: `Nothing matches "${clip(arg, 40)}".` }
    const isOpened = await openChat($, target)

    return {
      text: isOpened
        ? `Jumped to "${clip(target.title, 60)}" (${nameOf(keyOf(target))}).`
        : `Could not open "${clip(target.title, 60)}".`,
    }
  })

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

  // Item 11: every Code-tab chat in one list.
  on('ui.render', { component: 'Pane', requestId: CHATS }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Input, Text } = els
    const w = await loadWorld($)
    const view = await read($, chats)
    const list = await read($, sessions)
    const q = view.query.trim().toLowerCase()
    const match = w.rows.filter(
      r =>
        (view.project === undefined || keyOf(r) === view.project) &&
        (q === '' || r.title.toLowerCase().includes(q) || nameOf(keyOf(r)).toLowerCase().includes(q)),
    )
    const counts = { all: match.length, thinking: 0, done: 0, open: 0 }
    for (const r of match) counts[statusOf(w, r)] += 1
    if (e.props.placement === 'widget') {
      return <Text>{`${countsText(counts) || 'No chats'} · ${counts.all} chats`}</Text>
    }
    const tabbed = view.tab === 'all' ? match : match.filter(r => statusOf(w, r) === view.tab)
    const shown = tabbed.slice(0, view.limit)
    const groups: { label: string; rows: SessionRow[] }[] = []
    for (const r of shown) {
      const label = dayLabel(r.lastAt, w.t)
      const last = groups[groups.length - 1]
      if (last !== undefined && last.label === label) last.rows.push(r)
      else groups.push({ label, rows: [r] })
    }
    const tabs: readonly { id: ChatsView['tab']; label: string; n: number }[] = [
      { id: 'all', label: 'All', n: counts.all },
      { id: 'thinking', label: '◐ Thinking', n: counts.thinking },
      { id: 'done', label: '✔ Done', n: counts.done },
      { id: 'open', label: '○ Open', n: counts.open },
    ]
    const isMoreListed = list.rows.length >= list.asked && list.asked > 0

    return (
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" gap="sm" flexWrap="wrap" alignItems="center">
          {tabs.map(tab => (
            <Button
              key={`tab-${tab.id}`}
              variant={view.tab === tab.id ? 'primary' : 'secondary'}
              label={`${tab.label} ${tab.n}`}
              onPress={() => update($, chats, v => ({ ...v, tab: tab.id }))}
            />
          ))}
          {counts.done > 0 && (
            <Button key="seen-all" plain dimColor label="Mark all seen" onPress={() => markSeen($, 'all')} />
          )}
        </Box>
        <Box flexDirection="row" gap="sm" flexWrap="wrap" alignItems="center">
          <Input
            key="q"
            placeholder="Filter by title or project"
            submitLabel="search inside chats"
            onInput={value => {
              void update($, chats, v => ({ ...v, query: value }))
            }}
            onSubmit={value => {
              void deepSearch($, value)
            }}
          />
          <Button
            key="deep"
            plain
            label={view.isSearching === true ? 'Searching…' : 'Search inside chats'}
            onPress={() => deepSearch($, view.query)}
          />
        </Box>
        {view.project !== undefined && (
          <Box flexDirection="row" gap="sm">
            <Text>{`Project: ${nameOf(view.project)}`}</Text>
            <Button
              key="all-projects"
              plain
              label="Show every project"
              onPress={() => update($, chats, v => ({ ...v, project: undefined }))}
            />
          </Box>
        )}
        {view.hits !== undefined && (
          <Box flexDirection="column">
            <Box flexDirection="row" gap="sm">
              <Text bold>
                {view.hits.length === 0
                  ? `No chat mentions "${clip(view.hitsFor ?? '', 40)}"`
                  : `${view.hits.length} chats mention "${clip(view.hitsFor ?? '', 40)}"`}
              </Text>
              <Button
                key="hits-clear"
                plain
                dimColor
                label="Clear"
                onPress={() => update($, chats, v => ({ ...v, hits: undefined, hitsFor: undefined }))}
              />
            </Box>
            {view.hits.map(hit => (
              <Box flexDirection="column">
                <Button
                  key={`h-${hit.id}`}
                  plain
                  label={clip(hit.title, 64)}
                  onPress={() => openChat($, { ...hit, link: linkFor(w, hit.id) })}
                />
                <Text dimColor wrap="truncate-end">{hit.snippet}</Text>
              </Box>
            ))}
          </Box>
        )}
        {list.error !== undefined && <Text color={SERIOUS}>{`▲ The app's chat list did not answer: ${list.error}`}</Text>}
        {shown.length === 0 && (
          <Text dimColor>{list.at === 0 ? 'Loading chats…' : 'No chats here.'}</Text>
        )}
        {groups.map(g => (
          <Box flexDirection="column">
            <Text dimColor bold>{g.label}</Text>
            {g.rows.map(r => chatRow($, els, w, r, view.project === undefined))}
          </Box>
        ))}
        {(tabbed.length > shown.length || isMoreListed) && (
          <Button
            key="more"
            label="Show more"
            onPress={async () => {
              await update($, chats, v => ({ ...v, limit: v.limit + 20 }))
              await refreshSessions($)
              quiet(refreshVisible($))
            }}
          />
        )}
        <Text dimColor>
          Code tab chats only: the Chat tab and cloud chats are not reachable. ● marks a chat that
          finished since you last opened it here.
        </Text>
      </Box>
    )
  })

  // Item 2: every project, with what the chips row leaves out.
  on('ui.render', { component: 'Pane', requestId: PROJECTS }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Input, Select, Text } = els
    const w = await loadWorld($)
    const cp = await read($, chipPrefs)
    const q = ((await read($, band)).query ?? '').trim().toLowerCase()
    const all = projectsOf(w)
    if (e.props.placement === 'widget') return <Text>{`${all.length} projects`}</Text>
    const isHidden = (p: Project) => cp.hidden.includes(p.key) || cp.untilActive.includes(p.key)
    const listed = sortProjects(
      all.filter(p => !isHidden(p) && (q === '' || p.name.toLowerCase().includes(q))),
      cp,
    )
    const hidden = all.filter(isHidden)
    const gone = [...cp.hidden, ...cp.untilActive].filter(k => !all.some(p => p.key === k))

    return (
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" gap="sm" flexWrap="wrap" alignItems="center">
          <Input
            key="pq"
            placeholder="Filter projects"
            submitLabel="filter"
            onInput={value => {
              void update($, band, b => ({ ...b, query: value }))
            }}
            onSubmit={value => {
              void update($, band, b => ({ ...b, query: value }))
            }}
          />
          <Select
            key="psort"
            label="Sort"
            value={cp.sort}
            options={[
              { value: 'recent', label: 'Newest first' },
              { value: 'name', label: 'Name' },
              { value: 'hot', label: 'Fullest context' },
            ]}
            onSelect={value => {
              if (value === 'recent' || value === 'name' || value === 'hot') {
                void saveChips($, c => ({ ...c, sort: value }))
              }
            }}
          />
          <Select
            key="pcount"
            label="Chips shown"
            value={cp.count}
            options={[
              { value: 'auto', label: 'Auto (what fits)' },
              { value: '5', label: '5' },
              { value: '8', label: '8' },
              { value: '12', label: '12' },
            ]}
            onSelect={value => {
              if (value === 'auto' || value === '5' || value === '8' || value === '12') {
                void saveChips($, c => ({ ...c, count: value }))
              }
            }}
          />
        </Box>
        {listed.length === 0 && <Text dimColor>No projects here.</Text>}
        {listed.map(p => {
          const s = STATUS[projectStatus(p)]
          const id = hash(p.key)

          return (
            <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
              <Text color={s.color}>{`${s.glyph} ${s.word}`}</Text>
              <Button
                key={`p-${id}`}
                plain
                label={`${cp.pinned.includes(p.key) ? '📌 ' : ''}${p.name}`}
                onPress={() => update($, band, b => ({ ...b, project: p.key, menu: undefined }))}
              />
              <Text dimColor>
                {[
                  `${p.rows.length} chats`,
                  countsText(p),
                  p.hot === undefined ? '' : `fullest ${p.hot}%`,
                  ago(p.lastAt, w.t),
                ]
                  .filter(x => x !== '')
                  .join(' · ')}
              </Text>
              <Button
                key={`pin-${id}`}
                plain
                dimColor
                label={cp.pinned.includes(p.key) ? 'Unpin' : 'Pin'}
                onPress={() => pinProject($, p.key)}
              />
              <Button key={`hide-${id}`} plain dimColor label="Hide" onPress={() => hideProject($, p.key, false)} />
            </Box>
          )
        })}
        {(hidden.length > 0 || gone.length > 0) && <Text bold>Hidden</Text>}
        {hidden.map(p => (
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Text dimColor>
              {`${p.name} · ${cp.untilActive.includes(p.key) ? 'until a chat is active' : 'always'}`}
            </Text>
            <Button key={`restore-${hash(p.key)}`} plain label="Restore" onPress={() => restoreProject($, p.key)} />
          </Box>
        ))}
        {gone.map(k => (
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Text dimColor>{`${nameOf(k)} · no chats now`}</Text>
            <Button key={`restore-${hash(k)}`} plain label="Restore" onPress={() => restoreProject($, k)} />
          </Box>
        ))}
        <Text dimColor>
          A project is a chat's sidebar group, or its folder when it has none. Press a name to open
          it under the chips.
        </Text>
      </Box>
    )
  })

  // Item 6: how the limits have been used, and what fills this chat.
  on('ui.render', { component: 'Pane', requestId: USAGE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg: SvgEl = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const m = await read($, meter)
    const hist = await read($, history)
    const detail = await read($, usage)
    const t = Math.max(await read($, now), await $.clock.now())
    if (e.props.placement === 'widget') {
      return (
        <Text>
          {m === null
            ? 'No usage yet'
            : `5h ${m.five?.pct ?? '–'}% · 7d ${m.seven?.pct ?? '–'}% · chat ${m.ctxPct ?? '–'}%`}
        </Text>
      )
    }
    const section = (label: string, pick: 'five' | 'seven', win: LimitWindow | undefined, len: number) => {
      if (win === undefined) {
        return <Text dimColor>{`${label}: no reading yet (it comes with this chat's first reply).`}</Text>
      }
      const burn = burnOf(hist.samples, pick, win, len, t)
      const pace = paceOf(win, len, t)
      const inWindow = hist.samples.filter(s => s[pick] !== undefined && s.t >= t - len).slice(-40)

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap="sm">
            <Text bold>{`${label}: ${win.pct}% used`}</Text>
            {pace !== null && (
              <Text color={pace.isAhead ? WARN : undefined} dimColor={!pace.isAhead}>
                {`${pace.isAhead ? '▲ ahead of pace' : 'on pace'} · ${Math.round(pace.elapsed * 100)}% of the time gone`}
              </Text>
            )}
          </Box>
          {burn !== null && Svg ? (
            <Svg source={burn.svg} alt={`${label} use over its window. ${burn.note}`} width={300} height={80} />
          ) : (
            <Text color={THINK}>{spark(inWindow.map(s => s[pick] ?? 0)) || '·'}</Text>
          )}
          {burn !== null && <Text dimColor>{burn.note}</Text>}
        </Box>
      )
    }
    const days = lastDays(hist.daily, t, 30)
    const models = (detail?.windows ?? []).filter(win => !/5.?hour/i.test(win.label))

    return (
      <Box flexDirection="column" gap="sm">
        <Text dimColor>Solid line: your use. Dotted diagonal: even pace. Dashed: where it is heading.</Text>
        {section('5-hour limit', 'five', m?.five, FIVE_MS)}
        {section('7-day limit', 'seven', m?.seven, SEVEN_MS)}
        <Box flexDirection="column">
          <Text bold>Last 30 days</Text>
          {Svg ? (
            <Svg
              source={daysSvg(hist.daily, t)}
              alt={`Highest 5-hour use on each of the last 30 days: ${days.map(d => d.five).join(', ')}`}
              width={300}
              height={48}
            />
          ) : (
            <Text color={THINK}>{spark(days.map(d => d.five))}</Text>
          )}
          <Text dimColor>
            One bar a day: the highest the 5-hour limit reached; the grey mark is the 7-day limit.
            Days fill in from when the mod was installed.
          </Text>
        </Box>
        {models.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Weekly limits</Text>
            {models.map(win => {
              const resets = win.resetsAt === undefined ? Number.NaN : Date.parse(win.resetsAt)

              return usageRow(
                els,
                Svg,
                win.label,
                win.pct,
                Number.isNaN(resets) ? '' : `resets in ${dur(resets - t)}`,
                win.pct >= 90 ? SERIOUS : win.pct >= 75 ? WARN : THINK,
              )
            })}
          </Box>
        )}
        <Box flexDirection="column">
          <Text bold>
            {`What fills this chat${m?.ctxPct === undefined ? '' : ` (${m.ctxPct}% of ${Math.round(m.ctxWindow / 1000)}k)`}`}
          </Text>
          {detail === null || detail.categories.length === 0 ? (
            <Text dimColor>The app has not reported this chat's breakdown yet.</Text>
          ) : (
            detail.categories.map(c =>
              usageRow(els, Svg, c.name, c.percent, `${Math.round(c.tokens / 1000)}k tokens`, THINK),
            )
          )}
        </Box>
        <Box flexDirection="row" gap="sm" alignItems="center">
          <Button key="usage-refresh" plain label="Refresh" onPress={() => refreshUsage($)} />
          <Text dimColor>
            {detail === null ? '' : t - detail.at < MIN ? 'App figures just read · ' : `App figures ${dur(t - detail.at)} old · `}Use by project is not
            reported by the app.
          </Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Button, Link, Select, Text } = els
    const Svg: SvgEl = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const m = await read($, meter)
    const w = await loadWorld($)
    const t = w.t
    const p = await read($, prefs)
    const isOpen = await read($, showSettings)
    const replyAt = await read($, lastReplyAt)
    const list = await read($, sessions)
    const cp = await read($, chipPrefs)
    const view = await read($, band)
    const act = await read($, activity)
    const pick = await read($, effort)
    const cols = e.props.bodyColumns

    const toggle = (
      <Button
        key="settings"
        plain
        label={isOpen ? '−' : '+'}
        onPress={() => update($, showSettings, v => !v)}
      />
    )
    const check = (isOn: boolean) => (isOn ? '☑' : '☐')
    const settingsRows = isOpen && (
      <Box flexDirection="column">
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          <Text dimColor>Pop-up alerts when:</Text>
          <Button
            key="t-context"
            plain
            label={`${check(p.toastContext)} this chat passes 80%`}
            onPress={() => togglePref($, 'toastContext')}
          />
          <Button
            key="t-pace"
            plain
            label={`${check(p.toastPace)} 5h or 7d use runs ahead of pace`}
            onPress={() => togglePref($, 'toastPace')}
          />
          <Button
            key="t-done"
            plain
            label={`${check(p.toastDone)} another chat finishes`}
            onPress={() => togglePref($, 'toastDone')}
          />
          <Button
            key="t-stale"
            plain
            label={`${check(p.toastStale)} figures are 10 min old`}
            onPress={() => togglePref($, 'toastStale')}
          />
        </Box>
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          <Text dimColor>Show:</Text>
          <Button
            key="t-chips"
            plain
            label={`${check(p.chips)} project chips`}
            onPress={() => togglePref($, 'chips')}
          />
          <Button
            key="t-activity"
            plain
            label={`${check(p.activity)} what Claude is doing`}
            onPress={() => togglePref($, 'activity')}
          />
          <Button key="open-projects" plain label="Projects…" onPress={() => openProjects($)} />
          <Button key="open-usage" plain label="Usage history…" onPress={() => openPane($, USAGE, 'Usage history')} />
        </Box>
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          <Text dimColor>Window glow:</Text>
          <Button
            key="t-tint"
            plain
            label={`${check(p.tint)} amber from 60%, orange from 80%`}
            onPress={() => togglePref($, 'tint')}
          />
          <Button key="preview" plain label="Preview 8s" onPress={() => previewTint($)} />
          <Link href={GUIDE_URL}>Guide</Link>
        </Box>
        <Text dimColor>
          Desktop tools {list.at === 0 ? '…' : list.error === undefined ? '✓' : `✗ ${list.error}`} · width {cols}
        </Text>
      </Box>
    )

    // The chats button: how many are thinking or done, out of how many.
    const counts = { thinking: 0, done: 0, open: 0 }
    for (const r of w.rows) counts[statusOf(w, r)] += 1
    const chatsButton = w.rows.length > 0 && (
      <Button
        key="chats"
        plain
        label={[
          counts.thinking > 0 ? `◐ ${counts.thinking} thinking` : '',
          counts.done > 0 ? `✔ ${counts.done} done` : '',
          `${w.rows.length} chats`,
        ]
          .filter(s => s !== '')
          .join(' · ')}
        onPress={() => openChats($)}
      />
    )
    const effortPicker = cols >= 60 && (
      <Select
        key="effort"
        label="Effort next reply"
        value={pick}
        options={EFFORTS}
        onSelect={value => {
          const found = EFFORTS.find(one => one.value === value)
          if (found !== undefined) void update($, effort, () => found.value)
        }}
      />
    )

    // Item 2: one chip a project.
    const projects = projectsOf(w)
    const order = chipOrder(projects, cp)
    const chips = order.slice(0, chipFit(cp, cols))
    const extra = projects.length - chips.length
    const chipsRow = p.chips && projects.length > 0 && (
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        {chips.map(proj => {
          const s = STATUS[projectStatus(proj)]
          const id = hash(proj.key)
          const isShown = view.project === proj.key
          const busy = proj.thinking + proj.done

          return (
            <Box flexDirection="row" gap="xs" alignItems="center" flexShrink={0}>
              <Button
                key={`chip-${id}`}
                plain
                label={`${s.glyph} ${clip(proj.name, 16)}${busy > 0 ? ` ${busy}` : ''}${isShown ? ' ▾' : ''}`}
                onPress={() =>
                  update($, band, b => ({ ...b, project: b.project === proj.key ? undefined : proj.key, menu: undefined }))
                }
              />
              {Svg && proj.hot !== undefined ? (
                <Svg
                  source={thinSvg(proj.hot, zoneOf(proj.hot)?.color ?? TRACK, `${proj.name}: fullest chat ${proj.hot}%`)}
                  alt={`${proj.name}: fullest chat at ${proj.hot}% context`}
                  width={28}
                  height={6}
                  isInteractive
                />
              ) : null}
              <Button
                key={`menu-${id}`}
                plain
                dimColor
                label="⋯"
                onPress={() => update($, band, b => ({ ...b, menu: b.menu === proj.key ? undefined : proj.key }))}
              />
            </Box>
          )
        })}
        <Button
          key="more-projects"
          plain
          dimColor={extra <= 0}
          label={extra > 0 ? `+${extra} more` : 'Projects'}
          onPress={() => openProjects($)}
        />
      </Box>
    )
    const menuOf = view.menu === undefined ? undefined : projects.find(proj => proj.key === view.menu)
    const menuRow = p.chips && menuOf !== undefined && (
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        <Text dimColor>{`${menuOf.name}:`}</Text>
        <Button
          key="m-pin"
          plain
          label={cp.pinned.includes(menuOf.key) ? 'Unpin' : 'Pin first'}
          onPress={() => pinProject($, menuOf.key)}
        />
        <Button
          key="m-hide"
          plain
          label="Hide"
          onPress={async () => {
            await hideProject($, menuOf.key, false)
            await update($, band, b => ({ ...b, menu: undefined }))
          }}
        />
        <Button
          key="m-quiet"
          plain
          label="Hide until active"
          onPress={async () => {
            await hideProject($, menuOf.key, true)
            await update($, band, b => ({ ...b, menu: undefined }))
          }}
        />
        <Button key="m-close" plain dimColor label="Close" onPress={() => update($, band, b => ({ ...b, menu: undefined }))} />
        <Text dimColor>Hidden projects come back from "Projects".</Text>
      </Box>
    )

    // Item 3: the open project's chats, under the chips.
    const drawerOf = view.project === undefined ? undefined : projects.find(proj => proj.key === view.project)
    const drawer = drawerOf !== undefined && (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX="xs">
        <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
          <Text bold>{drawerOf.name}</Text>
          <Text dimColor>
            {[
              `${drawerOf.rows.length} chats`,
              countsText(drawerOf),
              drawerOf.hot === undefined ? '' : `fullest ${drawerOf.hot}%`,
              ago(drawerOf.lastAt, t),
            ]
              .filter(x => x !== '')
              .join(' · ')}
          </Text>
          <Button key="d-close" plain label="Close" onPress={() => update($, band, b => ({ ...b, project: undefined }))} />
          <Button
            key="d-sidebar"
            plain
            dimColor
            label={view.isSidebarHidden === true ? 'Show app sidebar' : 'Hide app sidebar'}
            onPress={() => toggleSidebar($)}
          />
        </Box>
        {drawerOf.rows.slice(0, 6).map(r => chatRow($, els, w, r, false))}
        {drawerOf.rows.length > 6 && (
          <Button
            key="d-more"
            plain
            label={`All ${drawerOf.rows.length} chats…`}
            onPress={() => openChats($, drawerOf.key)}
          />
        )}
      </Box>
    )

    // Item 4: what Claude is doing, while it works.
    const doneTodos = act.todos.filter(one => one.status === 'completed').length
    const curTodo = act.todos.find(one => one.status === 'in_progress')
    const topTools = Object.entries(act.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, n]) => `${name} ${n}`)
      .join(', ')
    const activityRow = p.activity && e.props.isWorking && (
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        <Text color={THINK} bold>
          {act.phase === 'tool' && act.tools.length > 0 ? `⚙ Running ${act.tools.join(', ')}` : '◐ Thinking'}
        </Text>
        {act.effort !== undefined && <Text dimColor>{`effort ${act.effort}`}</Text>}
        {act.count > 0 && (
          <Text dimColor>{`${act.count} tool ${act.count === 1 ? 'call' : 'calls'}${cols >= 80 && topTools !== '' ? ` (${topTools})` : ''}`}</Text>
        )}
        {act.agents.running > 0 && (
          <Text dimColor>
            {`${act.agents.running} ${act.agents.running === 1 ? 'agent' : 'agents'}${cols >= 80 ? ` (${act.agents.names.join(', ')})` : ''}`}
          </Text>
        )}
        {act.todos.length > 0 && (
          <Text dimColor>
            {`to-dos ${doneTodos}/${act.todos.length}${curTodo !== undefined && cols >= 80 ? `: ${clip(curTodo.text, 40)}` : ''}`}
          </Text>
        )}
      </Box>
    )

    const below = (
      <Box flexDirection="column">
        {chipsRow}
        {menuRow}
        {drawer}
        {activityRow}
        {settingsRows}
      </Box>
    )

    if (m === null) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
            <Text dimColor>Usage shows after this chat's first reply</Text>
            {chatsButton}
            {effortPicker}
            {toggle}
          </Box>
          {below}
        </Box>
      )
    }

    const age = t - m.measuredAt
    const isFaded = age > STALE_MS
    const z = zoneOf(m.ctxPct)
    const cacheLeft = replyAt === null ? undefined : CACHE_MS - (t - replyAt)
    const fivePace = m.five ? paceOf(m.five, FIVE_MS, t) : null
    const sevenPace = m.seven ? paceOf(m.seven, SEVEN_MS, t) : null
    const isEdge = p.tint && z !== null && (m.ctxPct ?? 0) >= 60

    // One unit per meter: it wraps whole, never cut. Order: this chat first,
    // then the account's limits; a unit in trouble moves to the front.
    type Unit = {
      id: string
      level: number
      color: string | undefined
      parts: string[]
      tip: string
      bar?: string
      canPress?: boolean
    }
    const units: Unit[] = []

    const ctxLevel = m.ctxPct === undefined ? 0 : m.ctxPct >= 80 ? 2 : m.ctxPct >= 60 ? 1 : 0
    units.push({
      id: 'ctx',
      level: ctxLevel,
      color: z?.color,
      parts: z ? [`${z.glyph} ${m.ctxPct}%`, ...(cols >= 60 ? [z.name] : [])] : ['chat –'],
      tip:
        m.ctxPct === undefined
          ? 'This chat: no reading yet'
          : `This chat has used ${m.ctxPct}% of its ${Math.round(m.ctxWindow / 1000)}k context. Marks at 60 and 80.`,
      bar: Svg && barSvg(m.ctxPct ?? 0, z?.color ?? TRACK, [60, 80], undefined, isFaded, 'This chat'),
    })

    if (cacheLeft !== undefined) {
      units.push({
        id: 'cache',
        level: 0,
        color: undefined,
        parts: [cacheLeft > 0 ? `cache ${dur(cacheLeft)}` : 'cache cold'],
        tip:
          cacheLeft > 0
            ? `Prompt cache warm about ${dur(cacheLeft)} more: replying before then is cheaper (estimate)`
            : 'Prompt cache likely expired: the next reply rereads the whole chat',
        bar: Svg && ringSvg(cacheLeft, isFaded, 'Prompt cache'),
      })
    }

    const limitUnit = (id: string, label: string, win: LimitWindow | undefined, pace: Pace | null) => {
      if (win === undefined) return
      const fills = pace?.tail.startsWith('full') ?? false
      const level = win.pct >= 90 || (fills && pace?.isAhead) ? 2 : pace?.isAhead || win.pct >= 75 ? 1 : 0
      const color = level === 2 ? SERIOUS : level === 1 ? WARN : undefined
      const word = pace === null ? '' : fills ? `fills ${pace.tail.replace('full in ', '')}` : `resets ${pace.tail.replace('resets in ', '')}`
      units.push({
        id,
        level,
        color,
        parts: [`${level > 0 ? '▲ ' : ''}${label} ${win.pct}%`, ...(cols >= 80 && word !== '' ? [word] : [])],
        tip: `${label} plan limit: ${win.pct}% used${pace ? `, ${Math.round(pace.elapsed * 100)}% of the window gone, ${pace.tail}` : ''}. Press the figure for its history.`,
        bar: Svg && barSvg(win.pct, color ?? THINK, [], pace?.elapsed, isFaded, `${label} limit`),
        canPress: true,
      })
    }
    limitUnit('five', '5h', m.five, fivePace)
    limitUnit('seven', '7d', m.seven, sevenPace)

    const ordered = [...units].sort((a, b) => b.level - a.level)

    const row = (
      <Box flexDirection="row" gap="md" alignItems="center" flexWrap="wrap">
        {ordered.map(u => (
          <Box
            key={u.id}
            flexDirection="row"
            gap="xs"
            alignItems="center"
            flexShrink={0}
            paddingX={u.level === 2 ? 'xs' : 0}
            backgroundColor={u.level === 2 && !isFaded && e.surface !== 'terminal' ? HIGHLIGHT : undefined}
          >
            {Svg && u.bar !== undefined ? (
              <Svg
                source={u.bar}
                alt={u.tip}
                width={u.id === 'cache' ? 12 : 48}
                height={12}
                isInteractive
              />
            ) : null}
            {u.canPress === true ? (
              <Button
                key={`m-${u.id}`}
                plain
                dimColor={isFaded}
                label={u.parts[0]}
                onPress={() => openUsage($)}
              />
            ) : (
              <Text
                color={isFaded ? undefined : u.color}
                dimColor={isFaded || (u.color === undefined && u.id === 'cache')}
                bold={u.level > 0 || u.id === 'ctx'}
              >
                {u.parts[0]}
              </Text>
            )}
            {u.parts.length > 1 && (
              <Text color={isFaded ? undefined : u.color} dimColor={isFaded || u.level === 0}>
                {u.parts[1]}
              </Text>
            )}
          </Box>
        ))}
        {cols >= 120 && m.model !== undefined && <Text dimColor>{m.model}</Text>}
        {isFaded && <Text dimColor>{dur(age)} old</Text>}
        {(m.ctxPct ?? 0) >= 80 && (
          <Button
            key="handoff"
            variant="primary"
            label="Write handoff"
            onPress={() => $.prompt.submit({ text: HANDOFF_PROMPT })}
          />
        )}
        {chatsButton}
        {effortPicker}
        {toggle}
      </Box>
    )

    return isEdge && z !== null ? (
      <Box flexDirection="column" borderStyle="round" borderColor={z.color}>
        {row}
        {below}
      </Box>
    ) : (
      <Box flexDirection="column">
        {row}
        {below}
      </Box>
    )
  })
}

const GUIDE_URL = 'https://github.com/firestarterpro/claude-ui-update/blob/main/GUIDE.md'
const HIGHLIGHT = '#f18a5933'
const GLASS = { blur: 16, opacity: 0.45 }

const openUsage = async ($: EngineInterface): Promise<void> => {
  await openPane($, USAGE, 'Usage history')
  await refreshUsage($)
}

// Shows the orange glow for 8 seconds, then puts back what the chat's
// context calls for.
const previewTint = async ($: EngineInterface): Promise<void> => {
  if ((await read($, tint)) === 'yielded') {
    $.ui.toast('Another mod set this chat\'s look, so the glow stays off here.')

    return
  }
  isOwnSet = true
  try {
    await $.theme.set({ backdrop: { scene: 'edge-80', glass: GLASS } })
  } finally {
    isOwnSet = false
  }
  $.clock.after(8_000, () => {
    void restoreTint($)
  })
}

const restoreTint = async ($: EngineInterface): Promise<void> => {
  const current = await read($, tint)
  if (current === 'yielded') return
  isOwnSet = true
  try {
    if (current === 'none') {
      await $.theme.clear()
    } else {
      await $.theme.set({ backdrop: { scene: current, glass: GLASS } })
    }
  } finally {
    isOwnSet = false
  }
}
