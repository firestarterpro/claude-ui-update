# Claude UI Update

Mods for the Claude desktop app's Code tab, built for a portrait monitor (about 1080 px wide). This repository is a plugin marketplace, so it can hold more mods as they come.

## Mods

### code-tab-hud (v1.0.0)

How to read it: [GUIDE.md](GUIDE.md).

Everything sits in rows above the message box; nothing sits beside the chat unless you open a list.

- **Usage strip**: this chat's context with zones (● Roomy, ◐ Working, ▲ Wrap up, ◆ Hand off), the prompt-cache countdown, and the 5h and 7d limits with an even-pace mark and "resets" or "fills". The limits refresh every 5 minutes from the app, even while the chat is idle.
- **All chats**: a button in the strip ("◐ 3 thinking · 12 chats") opens a list of every Code tab chat, newest first with day groups, tabs for Thinking, Done and Open, a filter, and a search inside chats. Pressing a chat switches to it.
- **Project chips**: one chip a project, with its status and the context of its fullest chat. `⋯` pins or hides a project; "+N more" opens the Projects list (filter, sort, restore, how many chips).
- **Projects drawer**: pressing a chip opens that project's chats under the chips.
- **Activity line**: while Claude works, the running tool, the tool count, running agents and to-dos.
- **Usage history**: pressing the 5h or 7d figure opens charts of each limit window, the last 30 days, each model's weekly limit, and what fills this chat.
- **Effort picker**: sets the thinking effort for the next reply only.
- **Pop-up alerts**: context 80%, a limit ahead of pace, another chat finishing, stale figures (off by default).
- **Window glow**: amber edge from 60% context, orange from 80%, with an off switch.
- Commands: `/chats` opens the list; `/jump 2` or `/jump name` switches chats.

The limit figures exist only on Pro and Max plans.

## Status of the v1 plan

| # | Feature | Status |
| --- | --- | --- |
| 1 | Meter strip (context, cache, 5h, 7d) | ✅ |
| 2 | Project chips | ✅ pin, hide, hide until active, chip count, `/jump`. Not possible: Alt+1..9 and Ctrl K (no global hotkeys), plain number keys (they would steal a digit typed into an empty message box), right-click menus, hover cards, rename, color, new chat, open in window |
| 3 | Projects drawer | ✅ under the chips. Not possible: pushing the chat down from the top of the window, share of weekly use per project |
| 4 | Activity line | ✅ |
| 5 | Terminal row | ❌ not possible: the app's chat list does not say which chats are terminal sessions, and a mod cannot move or restyle the app's terminal panel |
| 6 | Usage history | ✅ Not possible: use by project (the app does not report it) |
| 7 | Pop-up alerts | ✅ "Chat needs you" is not possible (the app reports no such state); "another chat finished" stands in for it |
| 8 | Window glow | ✅ |
| 9 | Tray icon | Replaced by the **Pace Orb** (`orb/pace-orb.ps1`, see below): always on top, outside any chat, fed by Observatory |
| 10 | Effort picker | ✅ in the strip, not inside the message box. Works on models that report an effort level |
| 11 | All chats list | ✅ Code tab chats only. Not possible: Chat tab and cloud chats, last line of each chat |

What the mod cannot know:

- **Done** means a chat finished since it was last on screen or opened from the mod. The app has no "unread" or "needs you" flag to read.
- A project is the chat's sidebar group, or its folder when it has no group.
- Another chat's context shows only while that chat is running or was recently active; an idle chat reports none.
- History charts fill in from the day the mod is installed.


## Pace Orb (always-visible limits)

The strip lives inside a chat's own Claude Code process, and the desktop app evicts idle chat processes, so it cannot be always visible. The Pace Orb is a small glass orb that floats on top of every window and does not depend on any chat.

- **Outer ring** = 7-day limit, **inner ring** = 5-hour limit, **number** = 5-hour % used, **small line** = time until the 5-hour reset.
- **White tick** on each ring = where an even pace would be now. An arc past its tick is ahead of pace.
- **Glow colour** = the worse of the two (green, amber, coral, grey when the reading is old). It **breathes** when the current pace runs out before the reset.
- **Click** opens a words panel (resets in your local time, pace in words, other weekly limits). **Drag** to move. **Right-click**: refresh, size, hide for an hour, open Observatory, exit.
- **Data**: Observatory's `/api/limits` (it runs `claude -p /usage` every 3 min while Claude is in use, 15 min when idle). If Observatory is not running, the orb starts it in the tray.
- **Evidence**: a heartbeat line every 5 min in `C:\Templar Archives\logs\pace-orb-YYYY-MM.log` (visible, topmost flag, and whether the orb is really the top window at its centre). `-Evidence` also saves a small screenshot of its corner every 30 min for 24 h in `logs\pace-orb-shots`.

Install (startup shortcut + start now), Windows PowerShell 5.1:

```powershell
& { $o = powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Templar Archives\Cybernetics Core\claude-ui-update\orb\pace-orb.ps1" -Install 2>&1 | Out-String; $o | Set-Clipboard; $o }
```

Remove (shortcut to the Recycle Bin, orb stopped):

```powershell
& { $o = powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Templar Archives\Cybernetics Core\claude-ui-update\orb\pace-orb.ps1" -Uninstall 2>&1 | Out-String; $o | Set-Clipboard; $o }
```

Check: same line with `-Status`.

## Install

From a shell:

```
claude plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update --scope user
```

In a terminal session of Claude Code:

```
/plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session, Code tab included.

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `firestarterpro/claude-ui-update`, then Add plugin.

## What the mod reaches

- The desktop app's own tools, read-only: the chat list, a chat's usage, search inside chats, the window layout. One write: the "Hide app sidebar" button.
- The system's link opener, only to open a chat's `claude://` link when you press a chat.
- Its own saved settings (`$.store`): switches, chip choices, seen stamps, limit readings.

It sends nothing to the network.

## Develop

```
claude plugin validate ./plugins/code-tab-hud
claude plugin test ./plugins/code-tab-hud
```

Design notes and the feasibility map live in `firestarterpro/stacks-attacks`, `handoffs/2026-11-25-claude-ui-mod.md`.
