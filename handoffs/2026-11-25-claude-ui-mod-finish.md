# Handoff 2026-11-25: finish Claude UI Update v1 in one pass

## Goal
Finish every remaining v1 item of the `code-tab-hud` mod for the Claude desktop Code tab, test it, push it, and give Jason one install line. Jason will NOT install until everything is done. He uses Windows, a portrait monitor (~96 columns in the band), and never the terminal.

## Read first (only these)
- Full spec, decisions and feasibility: `handoffs/2026-11-25-claude-ui-mod.md` (sections v1 spec, Feasibility, Decided by Claude, Status, desktop tool facts).
- The code: `C:\Templar Archives\Cybernetics Core\claude-ui-update\plugins\code-tab-hud\hooks\register.tsx` (~590 lines), `types/index.d.ts`, `test/hud.test.tsx`. Repo: https://github.com/firestarterpro/claude-ui-update (public, main @ 8276263, v0.2.0).
- Load the `plugin-authoring` skill. API types: grep its `types/claude-code.d.ts` (28k lines, never read it whole). Once the mod loads, the laid types are under `<mod>/.claude-plugin/types/` (MCP tool inputs in `claude-code-mcp/index.d.ts`).

## Done (v0.2.0, live-checked by Jason)
Items 1, 7, 8: a strip above the composer (context zones, cache ring, 5h/7d with pace, urgent unit first + highlight, wraps rather than cuts), pop-up alerts (80%, ahead of pace, stale), window glow with an 8s preview, a +/− settings row with plain labels, a Guide link, GUIDE.md, and a README status table. `claude plugin validate` passes; `claude plugin test` 5/5.

## To build (order)
1. **Item 11, All chats**: a Pane opened from a button in the strip (e.g. "3 thinking · 12 chats"). Data: `$.mcp.call('ccd_session_mgmt','list_sessions',{limit})` (JSON array: sessionId, title, cwd, isRunning, lastActivityAt, prNumber/prState, link, group). Poll on the existing 30s tick.
   - Rows: status glyph + word, title, project (cwd basename), age; newest first with day groups; "Show more" raises the limit by 20.
   - Search Input (title/project); "search transcripts" via `search_session_transcripts`.
   - Status tabs with counts: Thinking = isRunning, Done = not running with activity after the mod's seen-at stamp (kept in `$.store`), Open = the rest. Bold unseen Done.
   - Row press: a `Link` to `link` (claude://…); test that it switches chats.
   - Context per chat: `get_usage {session_id}` → `context.percentUsed` (an idle chat reports unavailable); call only for visible or running rows.
   - Places: Code tab only. Say "Chat tab and cloud not reachable".
2. **Item 2, project chips** in the band (one row): group sessions by cwd; a chip = status glyph + name + a thin Svg context bar of its hottest chat; "+N more" opens a Pane (search, sort, hidden list with Restore, chip count Auto/5/8/12); `⋯` per chip for pin / hide / hide until active (in `$.store`, reversible). Number hotkeys 1–9 work only while the band is focused, plus a `/jump` command. No Alt+ or Ctrl K.
3. **Item 3, projects drawer**: grows inside the band under the chips (one project open at a time), with the project row and its chat rows. Optional: a "collapse app sidebar" button via `ccd_window set_sidebar_collapsed`.
4. **Item 4, activity line** while working (`e.props.isWorking`): current tool from the `Spinner` site or `turn.step`, tool count per turn, running agents (`$.agent.list()`), todos from TodoWrite/Task ToolUse output. Do NOT hook `tool.call` / `tool.run` (it breaks backgrounding).
5. **Item 6, usage history**: a Pane from pressing a meter. Samples of 5h/7d % per measure kept in `$.store` (capped); a burn-up Svg with the pace line and projection; 30-day bars of daily max; "what fills this chat" from `get_usage('self').context.categories`; per-model weekly windows from `get_usage.plan.windows`.
6. **Item 10, effort picker**: a Select in the band; apply via a `turn.step` hook `next({...e, effort})` for the next turn, cleared at `turn.complete`.
7. **Item 5, terminal row**: only a mod row for terminal-type sessions, if list_sessions reveals them; otherwise mark it "not possible" in the README.
8. **Item 9, tray**: out of the mod. Either skip with a README note, or a tiny PowerShell NotifyIcon script reading a JSON the mod writes via `$.fs`. Ask Jason before building it.

## Rules and gotchas
- Status never by color alone (glyph + word). Colors: good #0aac23, warning #fbb315, serious #f18a59, needs you #e24d8b, thinking #338ced.
- `$.state` keys must be declared in `types/index.d.ts` (Shaped<T> with a shape tag); never write state while rendering. A Button holds only text; an Svg has no press. A Pane opens only from a press. Timers die on a hot reload (restart them in session.start).
- Write tests for each item (mock `mcp.call`, `clock`, `store`) and loop the surfaces `['terminal','desktop']`.
- Workflow: edit in the repo, then copy into the session's dev-mods folder for hot reload (the folder path comes from the plugin-authoring skill). Validate + test, bump to 1.0.0, update README/GUIDE, scan secrets (`mcp__plugin-authoring__scan_secrets`), commit, push.
- Check `get_usage('self')` before starting and at checkpoints; stop with a saved handoff if 5h passes ~90%. Jason's Pro 5h window ran out building v0.2.0.
- Mellow backlog note already exists (`Mellow My Man/docs/plan/13-claude-ui-update-features.md`); update it at the end if features change.

## Done means
All items above are built or marked impossible in the README with a reason; validate passes; tests pass; pushed; Jason gets one line:
`claude plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update --scope user`
plus a short "where everything is" table. After his install, the session-scoped dev copy is obsolete.

## Status 2026-11-25: v1.0.0 built and pushed (commit 85f2b61)
- Built: items 11, 2, 3, 4, 6, 10. Item 5 marked not possible in the README (list_sessions has no terminal flag). Item 9 (tray): Jason asked, see the chat for his answer.
- Checks: `claude plugin validate` passes clean; `claude plugin test` 12/12 on terminal and desktop; secrets scan clean; a 3-reviewer workflow (wf_f17cd7d0-b54) found 20 defects, all confirmed ones fixed before the push.
- NOT checked live (Jason was on the Cowork tab; the test would have pulled his window): pressing a chat. The mod opens the chat's `claude://` link with `$.process.run` (`rundll32 url.dll,FileProtocolHandler` on Windows) because a desktop `Link` draws a non-https URL as plain text. If it fails, a toast says to use the sidebar.
- Decided by Claude (reversible):
  - A project = the chat's sidebar group, else its cwd. All of Jason's chats share cwd `C:\Templar Archives`, so chips only split once chats are filed in sidebar groups.
  - No digit hotkeys on chips: the engine presses a band Button's digit from an EMPTY composer, so "2 things…" would toggle a chip. `/jump N` replaces them.
  - Done = finished since last on screen (each chat's copy checks `get_window_layout.this_session.on_screen` on the 30 s tick and stamps itself in `$.store`) or opened from the mod. No "needs you" exists; "another chat finished" toast stands in.
  - Limits refresh every 5 min from `get_usage('self')`, so the strip no longer greys while the app answers; context still comes from session.measure.
  - Effort is armed at turn.start for that turn only (activity.effort), applied in turn.step when the step reports an effort.
  - `'Svg' in els` is always true (the engine completes every table): pick Svg by `e.surface !== 'terminal'`.
- Not done: a dev copy in dev-mods (Jason installs from the marketplace); LICENSE file (the plugin directory wants one; Jason's choice).
- Next: Jason installs and uses it; expect tuning of chip widths at 96 columns and the look of native buttons in the strip.
