/** One rate-limit window as the meter strip keeps it. */
export type LimitWindow = { pct: number; resetsAt?: string }

/** The last usage reading of this chat (session.measure). */
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
  tint: boolean
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

/** Whether the desktop's own MCP tools answer this mod ($.mcp.call). */
export type Probe = { isOk: boolean; note: string; at: number }

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
      probe: Shaped<Probe | null>
    }
  }
}
