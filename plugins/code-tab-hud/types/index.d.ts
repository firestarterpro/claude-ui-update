/** One rate-limit window as the meter strip keeps it. */
export type LimitWindow = { pct: number; resetsAt?: string }

/** The last usage reading of this chat (session.measure, or the desktop's usage tool). */
export type Meter = {
  /** Context fill, 0-100; absent before the first reply and right after a compaction. */
  ctxPct?: number
  ctxTokens?: number
  ctxWindow: number
  five?: LimitWindow
  seven?: LimitWindow
  model?: string
  /** $.clock.now() when the reading arrived. */
  measuredAt: number
}

/** The person's switches, kept in $.store across sessions. */
export type Prefs = {
  toastContext: boolean
  toastPace: boolean
  toastStale: boolean
  /** A pop-up when another chat finishes its turn. */
  toastDone: boolean
  tint: boolean
  /** The project chips row under the strip. */
  chips: boolean
  /** The line that says what Claude is doing while it works. */
  activity: boolean
}

/** Once-per-crossing toast flags. */
export type Flags = {
  ctx80: boolean
  /** resetsAt of the 5h window already warned about. */
  paceFive?: string
  /** resetsAt of the 7d window already warned about. */
  paceSeven?: string
  stale: boolean
}

/** 'yielded': another plugin set the theme, so this mod stops setting one this session. */
export type Tint = 'none' | 'edge-60' | 'edge-80' | 'yielded'

/** Thinking = a turn is running. Done = finished since the mod last saw it. Open = the rest. */
export type ChatStatus = 'thinking' | 'done' | 'open'

/** One Code-tab chat, as the desktop's list_sessions gives it. */
export type SessionRow = {
  id: string
  title: string
  cwd: string
  isRunning: boolean
  /** lastActivityAt in milliseconds; 0 when the app gave none. */
  lastAt: number
  /** claude://… : opens the chat in the app. */
  link?: string
  /** The sidebar group's name, when the chat is filed under one. */
  group?: string
  /** "#3 OPEN" when the chat has a pull request. */
  pr?: string
}

/** The other chats of the Code tab, as last listed. */
export type Sessions = {
  rows: SessionRow[]
  /** $.clock.now() of the last answer; 0 before the first. */
  at: number
  /** How many rows were asked for. */
  asked: number
  error?: string
}

/** When the mod last saw each chat; `base` stands for a chat with no stamp. */
export type Seen = { base: number; at: Record<string, number> }

/** A hit of the search inside chats. */
export type Hit = { id: string; title: string; snippet: string }

/** What the All chats pane shows. */
export type ChatsView = {
  tab: 'all' | ChatStatus
  query: string
  /** Rows shown; "Show more" adds 20. */
  limit: number
  /** Only this project's chats, when set (from the drawer). */
  project?: string
  hits?: Hit[]
  hitsFor?: string
  isSearching?: boolean
}

/** Context fill of other chats, by session id; no `pct` = the chat did not report one. */
export type CtxMap = Record<string, { pct?: number; at: number }>

/** Chip choices, kept in $.store. Projects are named by their key (group name or folder). */
export type ChipPrefs = {
  pinned: string[]
  hidden: string[]
  /** Hidden until one of the project's chats is thinking or done. */
  untilActive: string[]
  count: 'auto' | '5' | '8' | '12'
  sort: 'recent' | 'name' | 'hot'
}

/** What is open in the band: the drawer's project and the chip menu's project. */
export type BandView = { project?: string; menu?: string; query?: string; isSidebarHidden?: boolean }

export type Todo = { text: string; status: 'pending' | 'in_progress' | 'completed' }

/** What Claude is doing in this chat's current turn. */
export type Activity = {
  turnId?: string
  phase: 'idle' | 'model' | 'tool'
  /** The tools the last step asked for. */
  tools: string[]
  /** Tool calls this turn. */
  count: number
  byTool: Record<string, number>
  agents: { running: number; names: string[] }
  todos: Todo[]
  /** The effort picked for this turn, armed when it started. */
  effort?: Exclude<Effort, 'default'>
}

/** One reading of the plan limits. */
export type Sample = { t: number; five?: number; seven?: number }

/** Limit readings (about 8 days) and each day's highest, kept in $.store. */
export type History = {
  samples: Sample[]
  /** Local day "2026-11-25" to that day's highest 5h and 7d percent. */
  daily: Record<string, { five: number; seven: number }>
}

/** The desktop usage tool's last answer for this chat. */
export type UsageDetail = {
  windows: { label: string; pct: number; resetsAt?: string }[]
  categories: { name: string; tokens: number; percent: number }[]
  ctxPct?: number
  at: number
}

/** 'default' leaves the chat's own effort alone. */
export type Effort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    'code-tab-hud': {
      meter: Shaped<Meter | null>
      lastReplyAt: number | null
      now: number
      prefs: Shaped<Prefs>
      flags: Shaped<Flags>
      showSettings: boolean
      tint: Tint
      sessions: Shaped<Sessions>
      self: Shaped<SessionRow | null>
      seen: Shaped<Seen>
      chats: Shaped<ChatsView>
      ctx: Shaped<CtxMap>
      chipPrefs: Shaped<ChipPrefs>
      band: Shaped<BandView>
      activity: Shaped<Activity>
      history: Shaped<History>
      usage: Shaped<UsageDetail | null>
      effort: Effort
    }
  }
}
