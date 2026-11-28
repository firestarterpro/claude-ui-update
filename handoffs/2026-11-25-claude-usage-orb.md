# Handoff 2026-11-25: Pace Orb, an always-visible Claude usage display

Follows `2026-11-25-claude-ui-mod-not-drawing.md` (root cause: the HUD lives in each chat's CLI process, which the desktop CliGovernor evicts) and replaces the tray idea in `2026-11-25-claude-ui-tray.md` (item 9).

## Decision
Build a standalone always-on-top "Pace Orb" (Windows PowerShell 5.1 + WPF, no build step) in `firestarterpro/claude-ui-update` at `orb/pace-orb.ps1`, fed by **Observatory's `/api/limits`**.

Why this route:
- **Data that survives with no chat open.** Observatory already runs `claude -p /usage` on its own (every 3 min in use, 15 min idle; `limit_snapshots` in `dashboard/data/archive.db` showed readings at 13:52, 13:55, 13:58, 14:04, 14:07 UTC on 2026-11-25). The code-tab-hud store file only updates while some chat process is alive, so it would go stale exactly when it matters. Observatory also gives burn-rate pace (`pace.hitsBeforeReset`, `etaMs`).
- **Outside any chat process.** Its own powershell.exe process, started at sign-in from a `shell:startup` shortcut; it starts Observatory with `--tray` if Observatory is not answering.
- **Not a plain tray number.** A tray icon is 16 px and hidden in the overflow by default. The orb is a glanceable gauge: two rings (5h inner, 7d outer) with an even-pace tick, glow colour by the worse limit, breathing when the pace runs out before reset, countdown to the 5h reset, click for words.
- **No .NET rebuild.** Putting it inside Observatory.exe would need the .NET 8 SDK build and risk the existing app; the script can move into Observatory later if wanted.
- Rejected: taskbar progress ring (needs a taskbar button, one value only), edge glow (ambiguous, no numbers), using the code-tab-hud store (stale with no chat).

## Rules kept
- Words, never colour alone: panel and tooltip spell out %, reset time, pace.
- No secrets, no tokens: it reads only the localhost API; no network beyond 127.0.0.1.
- Remove = one line (`-Uninstall`): shortcut to the Recycle Bin, process stopped. Logs are monthly files, never deleted.

## Evidence plan
Heartbeat every 5 min in `C:\Templar Archives\logs\pace-orb-YYYY-MM.log`: visible, topmost flag, `onTop` (WindowFromPoint at the orb's centre is the orb itself), position, 5h/7d, stale. `-Evidence` adds a corner screenshot every 30 min for 24 h in `logs\pace-orb-shots`.

## State
- Pushed to branch `claude/project-thread-waxtin` (draft PR). Install line in the repo README, section "Pace Orb".
- Verification results: see below (filled in after the live run).

## Live verification (2026-11-25, Acer, Windows PowerShell 5.1.26100)
- Parse: `PARSE OK` (PS 5.1 parser, no errors).
- API: `GET 127.0.0.1:8766/api/limits` -> tool `claude`, windows `5-hour` (19%), `weekly` (30%), `weekly-fable` (32%), each with usedPct + resetsAt; observedAt present. Observatory process `Observatory`, exe `C:\Templar Archives\Observatory\observatory\app\dist\Observatory.exe` = script default; no change needed.
- Test run (pid 29028): `started ... visible=True topmostFlag=True onTop=yes box=1824,912 84x84 5h=19% 7d=30% level=serious`. No `tick error`.
- Screenshot `C:\Templar Archives\logs\pace-orb-shots\live-test-2026-11-25.png` (+ `-zoom.png`): outer green arc ~30% (7d), inner orange arc ~19% (5h), white pace tick on each ring, "19%" centre, "4h 30m" countdown (5h reset 18:50 UTC). Matches API.
- Install: `-Install -Evidence` -> `Pace Orb.lnk` in Startup, `-Status` = running, shortcut True. Evidence shot `pace-orb-shots\20261125-0820.png`.
- 15-min watch (pid 28920):
  - 08:20:05 heartbeat onTop=yes 5h=20% 7d=30% stale=False
  - 08:25:05 heartbeat onTop=covered 5h=23% 7d=31% stale=False
  - 08:30:05 heartbeat onTop=covered 5h=30% 7d=32% stale=False
  - 08:35:09 heartbeat onTop=yes 5h=30% 7d=32% level=idle stale=True
  - API at 14:28:48Z: 5-hour=30, weekly=32 -> 5h matches the orb.
- Findings:
  - `stale=True` at 08:35 came from Observatory itself (`stale: true` on the claude card); the orb dimmed correctly. Not an orb bug.
  - `covered` twice: the orb could not say what covered it. Fix (commit `3798cd3` on `claude/project-thread-waxtin`): heartbeat now logs `covered(<process>/<window class>)`; checked standalone against the taskbar -> `covered(explorer/Shell_TrayWnd)`. Likely cause was a toast or tray flyout; the next covered line will name it.
- Reinstalled process after the fix: pid 40940, `onTop=yes`, startup shortcut True.
