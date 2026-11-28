# Handoff: code-tab-hud is installed but does not draw (2026-11-25)

For a fresh Opus chat. Goal: make the usage strip, chips, activity line and effort picker show in EVERY Code-tab chat, including new ones.

## Facts (checked)
- Installed: `code-tab-hud@claude-ui-update` 1.0.0, user scope, enabled (`claude plugin list`). Repo: `C:\Templar Archives\Cybernetics Core\claude-ui-update`, `plugins/code-tab-hud/hooks/register.tsx`.
- The mod LOADS in desktop sessions: it writes usage samples every few minutes (`~\.claude\plugins\store\code-tab-hud_claude-ui-update-*.json`) and the desktop lists its `/jump` and `/chats` commands (`Claude-Data\...\mod-commands.json`, blocked=false).
- It validates and `claude plugin test` passes 12/12. A headless `claude -p --debug-file` run loads it with no errors.
- It DID draw once, in the chat where I installed it (hot reload, 4:28 AM). After an app restart it did not draw in that chat, in new chats, or in project chats. The "Threads" project UI has no AbovePrompt slot at all, so nothing can draw there.
- Desktop log `~\AppData\Local\Claude\logs\main.log`: only `ui_render failed ... BesidePrompt` warnings, present since 11-23, before the mod; not ours. No error names code-tab-hud.

## Hypothesis (NOT verified)
The mod never calls `$.ui.invalidate('ui.render')`. If the app's first draw of a new chat happens before the mod loads, or a draw fails once, nothing redraws it (API docs: ui.render fires per input value, plugin load, or invalidate; after a fault the engine "draws nothing again" until asked).

## State of the repo
- UNCOMMITTED, untested edits in `register.tsx`: a `redraw($)` helper, called in `tick` (every 30s), at 0.5/2/6s after `session.start`, and from a new `on('ui.fault')` hook. Needs: `claude plugin validate`, `claude plugin test`, bump to 1.0.1, push, then `claude plugin update code-tab-hud@claude-ui-update`, then app restart and a look in a NEW chat.
- Nothing pushed since v1.0.0 (85f2b61).

## Next steps
1. Validate and test the edits above; ship 1.0.1.
2. If still blank in new chats, get real evidence: `claude --debug` of a desktop-spawned session, or add a `$.ui.log` line inside the AbovePrompt hook to see whether it is called and what `e.surface` is.
3. Tell the owner plainly which surfaces are impossible (project "Threads" chats).
4. Tray icon (item 9) is still deferred; see the tray handoff in this folder.

## Resolution (2026-11-25, later thread) — root cause VERIFIED
The redraw-timer hypothesis was wrong; those edits are stashed in claude-ui-update (`stash@{0}`), not shipped.

Real cause: the HUD runs inside each chat's own Claude Code process, and the desktop app does not keep those processes alive. Evidence:
- `main.log` `[CliGovernor]`: a cap of 6 live chat processes ("at cap=6; would evict … for user spawn") plus "pressure evicting local_… (idle Ns)" under memory pressure. The chat where the mod was installed (`local_a4d075bf`) drew at 4:28 and was evicted at 4:36 and 4:55, matching "drew once, then not".
- After an app restart, old chats have no process until a message is sent.
- Owner's own test (screenshot + report): 1.0.0 draws by itself in a NEW Code-tab chat; old chats show it only after he messages them (process respawned) and lose it again when left idle (evicted).
- Project "Threads" chats: a probe mod in one logged session.start but zero AbovePrompt/AbovePromptList requests in 5+ min. That surface has no band; nothing can draw there.
- No desktop setting keeps idle chats alive (checked the Code-tab settings list).

Conclusion: no mod-side fix exists. A strip that is ALWAYS visible needs a surface that does not live in a chat process (e.g. tray icon / Observatory widget / a small always-on window reading the same usage data). That is a separate fix type and gets its own thread if the owner wants it.

Cleanup: diagnostic probe at `~\.claude\hud-probe` is enabled through `~/.claude/settings.json` env `CLAUDE_CODE_PLUGIN_DIRS` (backup `settings.json.bak-20261125-probe`); owner restores settings, then the probe folder goes to the Recycle Bin. A copy also sits in this thread session's dev-mods folder.

## Owner context
Frustrated: 3 rounds without a working result. Keep reports short (done / blocker / next), verify on the live app before claiming success, and have the owner restart the app, not just open a chat.
