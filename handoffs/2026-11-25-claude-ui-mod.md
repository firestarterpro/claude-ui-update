# Handoff 2026-11-25: Claude UI mod v1

## Goal
Build a mod for the Claude desktop Code tab that shows per-chat context and plan usage in one compact strip, replaces the always-open sidebar with collapsible rows, and tracks every chat in one list, for a Windows user on a portrait monitor (about 1080 px wide).

## State (updated 2026-11-25, late)
- Design canvas, 5 frames: saved, not rendered or tested.
- Mod API mapped and verified (4-agent workflow wf_c0f7cf81-86f; full rows in that run's journal.jsonl).
- Mod `code-tab-hud` v0.1.0 built: items 1 (this chat only), 7, 8. `claude plugin validate` passes; `claude plugin test` 5/5 pass (terminal + desktop).
- LIVE 2026-11-25 (user screenshot): strip draws above the composer (context bar + zone, cache ring, 5h/7d bars with pace tick, ⚙ switches row). User verdict: "this works, I'll have to use it to know for sure". The edge tint is not yet seen (context was 25%).
- Probe: `$.mcp.call('ccd_session_mgmt', 'list_sessions', { limit })` WORKS from the mod with no prompt. Each row has sessionId, title, cwd, isArchived, isRunning, prNumber/prState, lastActivityAt, group, link (`claude://claude.ai/epitaxy/local_…`), remoteControlActive. The raw reply is in `~/.claude/plugins/store/code-tab-hud_inline-*.json` under `probe`.
- That lifts these cannots, pending a live test of each: the All chats data for Code-tab sessions (item 11: Thinking = isRunning, project = cwd, newest first); jumping from a chip to a chat (a `Link` to `link`, or `ccd_window open_session_in`); collapsing the sidebar (`ccd_window set_sidebar_collapsed`); pin/unread (`ccd_sidebar`). Still missing from list_sessions: needs-you and other chats' context % (try `get_session` / `get_usage`, else the heartbeat files).
- Tweak: the 5h/7d "resets in / full in" now shows from 80 cols (was 100). ⚙ shows "Width: N cols" to tune the cutoffs on the portrait monitor.

## Feasibility (verified against 2.1.330 types)
Cannot, with the fallback used or planned:
- Strip at the window top: no top render site. The strip is the mod's `AbovePrompt` band, pinned above the composer.
- Exact 36/42 px: layout is in font cells; only Svg takes px. Bars are Svg, rows are one cell high.
- Drawer that pushes the chat down from the top: it grows inside the band, so the transcript shrinks from the bottom. A dock as a Pane is possible; the surface picks the side.
- Alt+1..9, Ctrl K: no global hotkeys. Fallback: bare digits while the band is focused, plus a `/jump` command.
- Chip right-click: ContextMenu is transcript-only. Untested: a `Client` element's right-button pointer events. Fallback: a `⋯` button per chip.
- New chat, move, open in window, switching chats from a chip, collapsing the app sidebar: no documented API. Untested: `$.mcp.call` reaching the desktop's ccd_* MCP tools.
- Moving or restyling the app's terminal panel: no. Terminals show as the mod's own rows.
- Buttons on toasts: no (text only). "Write handoff" is a button in the strip at 80%+.
- Effort picker inside the composer: no. Planned: a Select in the band, applied per step via `turn.step`.
- Tray (item 9): outside the mod. A separate Windows program fed by heartbeat files.
- Chats from the claude.ai Chat tab and cloud: unreachable. Code tab and terminal sessions are reachable only through the mod's own per-session heartbeat files (each chat's copy writes its status; all read them).
Partial: prompt-cache ring (an estimate stamped at each reply; eviction can't be seen), edge tint (the Backdrop draws under frosted panels; how much shows is untested, so the band border also tints), native notifications on desktop (types and reference disagree; test them).

## Decided by Claude (2026-11-25, reversible)
- Mod name `code-tab-hud`; one mod for all items.
- Stale-data toast defaults OFF (the greying already shows it); context-80 and pace toasts default ON. The switches are behind ⚙ in the strip, kept in `$.store`.
- Pace: window lengths assumed 5h / 7d (the API gives only resetsAt). "Ahead" = used% > elapsed% + 10 points and used% at least 15. "full in" is a straight-line estimate.
- Tint: scenes `edge-60` (amber) / `edge-80` (orange) via `$.theme.set`. If another plugin sets a theme, the mod yields for the session and the band border carries the tint.
- Needs-you / thinking counts deferred to the 11/2/3 phase (they need the heartbeat bus).

## Decisions (user)
- Collapsible rows, not columns; sidebars only if collapsible and not needed for navigation.
- Everything below is v1.
- Project chips in the top area: expand past 5, close, hide for good, adjustable count, more than click-and-go.
- A pop-open section showing which chats are thinking, done or open: newest first, infinite scroll, searchable, from all places.
- Never uses the terminal; builds in the Code tab.

## v1 spec (drafted; in portrait everything stacks, nothing sits beside the chat)
Statuses: Thinking, Needs you, Done (finished, unseen), Open (seen, nothing running).
1. Meter strip, 36 px, one line: Context bar for the open chat (ticks at 60, 80), %, zone (Roomy under 40, Working, Wrap up from 60, Hand off from 80); prompt-cache ring (5 min countdown); 5h and 7d bars with even-pace tick, %, "resets in" or (if projected to fill early) "full in"; needs-you and thinking counts (click opens 11); model. Greys out with its age when data is over 10 min old. Narrow widths drop secondary text first.
2. Jump strip, 42 px: Projects toggle, chips (status dot, name, underline = hottest chat's context), "+N more", Ctrl K. Hover: peek card with quick reply. Right-click: pin, close until active, hide always, rename, color, move, new chat, open in window. "+N more": searchable list, sort, hidden list with restore, chips shown (Auto/5/8/12). Alt+1..9 jumps. Hidden projects still count when they need you.
3. Projects drawer: full width under the strips, pushes the chat down, closed by default, one project open at a time. Project row: name, count, status summary, hottest context, share of weekly use, age. Chat and terminal rows: title, status, last line, context, age. Above about 1400 px it may dock as a left pane.
4. Activity line while Claude works: current tool, tool counts, agents, todos.
5. Terminal row: one collapsed line, expands in place.
6. Usage history (click a meter): 5h and 7d burn-up with pace, projection and "full" marker; 30-day bars; use by project; what fills this chat.
7. Toasts, each switchable: context 80% with "Write handoff"; limit ahead of pace; chat needs you; stale data.
8. Edge tint: amber from 60%, orange from 80%; off switch.
9. Windows tray companion: two-bar icon (5h, 7d), needs-you dot, tooltip, popup.
10. Composer: per-prompt effort picker.
11. All chats: sheet under the strips, Pin docks it. Newest first, day groups, loads older on scroll, search (title, project, last line), status tabs with counts, place filter (Code tab, Terminal, Chat, Cloud). Row: status, title, project, place, last line or current tool, context where reported, age. Unseen Done rows bold.

## Open
- Unconfirmed by user: the canvas, drawer-under-strip, thresholds, colors, the meaning of "Open", designer's additions (item 10, "Write handoff").
- Mod API limits: full-width drawer and sheet, hotkeys, data for unopened chats, moving the terminal.
- Places item 11 can list: Code sessions likely; Chat and Cowork tabs unknown.
- Tray is probably outside the mod: an artifact installed as a Windows app (unverified) or usage-monitor-for-claude.

## Status 2026-11-25 (paused at 5h = 97%)
- v0.2.0 pushed (commit 8276263): readable strip, urgency order + highlight, +/− toggle, plain-language switches, 8s glow preview, GUIDE.md, v1 status table in the README.
- User: will NOT install until everything is done. Build all remaining items before asking again.
- Desktop tool facts for the next build (checked live):
  - `get_usage {session_id}` returns `plan.windows[]` {label "5-hour limit" / "Weekly · all models" / "Weekly · <model>", percentUsed, resetsAt, resetsIn}, `plan.extraUsage`, and `context` {tokensUsed, contextWindow, percentUsed, autoCompactsAtPercent, categories[] {name, tokens, percent}}. It's per session, so it gives other chats' context (an idle chat reports unavailable), and its categories feed item 6 "what fills this chat". It also shows per-model weekly limits, which the strip could add.
  - `open_session_in` works only for "self" or chats this chat started. To open any chat from a row or chip, use a `Link` to the session's `link` (`claude://…`); untested.
  - `list_events {session_id, limit}` gives the transcript text (for "last line"); use it sparingly.
  - `get_session` adds model, effort, pinned, created time. There's no "needs you" or unread flag anywhere: derive Done-unseen from lastActivityAt versus the mod's own seen-at stamps.

## Next action
1. The user runs the strip in daily use. Still to see: the tint at 60%+ (does the Backdrop show past the panels?), the toasts, and the "Width" readout to tune the cutoffs.
2. Item 11 from `list_sessions` (+ `get_session` for detail), then 2 and 3. Test early: does a `Link` to `claude://…/local_…` switch chats, and does `open_session_in` work from the mod? Use the heartbeat bus only for what the desktop tools don't give (needs-you, context of other chats).
3. Then 4 to 6 (activity line via Spinner / turn.step, not tool.call hooks; history from samples), then 9.

## Where things are
- Canvas: https://claude.ai/artifact/SjePqRAUghmFxZihM7uRMk (private; slug d068bfe1-101c-4689-85bf-7f2e89dae593; project/Main, Chips, Usage, Tray, Threads .dc.html).
- Repo (PUBLIC, user's choice 2026-11-25): https://github.com/firestarterpro/claude-ui-update, local `C:\Templar Archives\Cybernetics Core\claude-ui-update`. It's a marketplace (`.claude-plugin/marketplace.json`) with mods under `plugins/`; first commit e53ac6d. Install: `claude plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update`. Edit here from now on, not in dev-mods.
- Mellow backlog note: `Robotics Facility\Mellow My Man\docs\plan\13-claude-ui-update-features.md` (uncommitted). Mellow already has ACC limit rings and chips; the note lists what to add in the redesign.
- Old dev copy (session-scoped, hot-reloaded): `C:\Users\kcorn\.claude\dev-mods\9e4d74f8-af18-4db9-8484-e27fd76642ff\code-tab-hud\` (hooks/register.tsx, types/index.d.ts, test/hud.test.tsx). The folder is session-scoped dev space: copy it into a repo before sharing or installing elsewhere.
- Mod API types (this build): bundled plugin-authoring skill, `types/claude-code.d.ts` (28.5k lines; grep, never read whole).

## Constraints
- Portrait first: horizontal space goes to the chat. Windows keys. Close and Hide must be reversible.
- Status never by color alone: dot shape plus label. Good #0aac23, warning #fbb315, serious #f18a59, needs you #e24d8b, thinking #338ced, on #191919.

## Already checked
- Status line payload: context_window.used_percentage, rate_limits.five_hour / seven_day (used_percentage, resets_at); limits only for Pro/Max after the first reply (secondary sources). Use it instead of OAuth credentials.
- Mod API 2.1.330: `session.measure` / `session.usage` return `{ context, rateLimits, cost }` (the status line's figures, rate limits empty off a subscription). Render components include AbovePrompt, AbovePromptList, Pane, Placed, Backdrop, ContextMenu, PromptHint, SessionMode, Spinner, ToolProgress.
- Desktop 1.5186.0 added list_sessions, search_session_transcripts, archive_session MCP tools for Code sessions (changelog snippet).
- Session logs: JSONL under ~/.claude/projects/ (secondary). GitHub issue 22723 (status unknown): terminal sessions missing from the desktop's Local list, so read those from the logs.
- Avoid the stale-value-after-switching-chats bug (claudeissues 85437).
