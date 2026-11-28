# Handoff 2026-11-25: Windows tray icon for code-tab-hud (item 9)

## Goal
A Windows tray icon showing the 5-hour and 7-day Claude plan limits, fed by the `code-tab-hud` mod. Jason chose "build it later" on 2026-11-25 (the 5-hour limit was at 76% after v1.0.0). Start after the reset; he never uses the terminal.

## State
- Mod v1.0.0 is pushed (`firestarterpro/claude-ui-update`, commit 85f2b61). It writes NO status file yet.
- Nothing of the tray exists.

## Build (two parts)
1. **Mod v1.1.0** (`C:\Templar Archives\Cybernetics Core\claude-ui-update\plugins\code-tab-hud\hooks\register.tsx`): in `tick` and after `refreshUsage`, write a small JSON with `$.fs.write` (check the path rules: grep `'fs.write'` in the plugin-authoring skill's `types/claude-code.d.ts`). Suggested file: `%USERPROFILE%\.claude\code-tab-hud\status.json` with `{ at, five: {pct, resetsAt}, seven: {pct, resetsAt}, thinking, done, chats }`. Every chat's copy of the mod writes it; write only when the values changed. Add a switch under "+" ("write the tray file", default on only if the tray is installed, or simply always on). Add a test (mock `fs.write`), validate, test, bump, push.
2. **Tray script** in the same repo, e.g. `tray/code-tab-hud-tray.ps1`, Windows PowerShell 5.1: `System.Windows.Forms.NotifyIcon` with an icon drawn at runtime (`System.Drawing.Bitmap` 16x16: two vertical bars, 5h and 7d, colors good #0aac23 / warning #fbb315 / serious #f18a59 by the same levels as the strip), tooltip "5h 46% resets 2h · 7d 20%", a dot when a chat is Done, a timer rereading the file every 30 s, greyed when the file is over 10 min old, a right-click menu with Exit. Start it hidden at login with a shortcut in `shell:startup` (`powershell -WindowStyle Hidden -File …`). Give Jason one PowerShell line that installs the shortcut and starts it (his rule: one command wrapped in `& { }`, output copied to the clipboard).

## Rules
- Status never by color alone: the tooltip carries the words.
- No secrets, no network. The script only reads the one JSON file.
- Removal must be one line too (delete the startup shortcut, stop the process); deleted files go to the Recycle Bin.
- Mod-API gotchas are in memory `claude-ui-update` and in `handoffs/2026-11-25-claude-ui-mod-finish.md` (status section).

## Done means
The icon shows live figures within 30 s of a change, survives a reboot, and Jason has one install line and one remove line. README item 9 updated from "not built" to how to install it.
