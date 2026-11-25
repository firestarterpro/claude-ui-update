# Quick guide: code-tab-hud

Everything sits in rows just above the message box in every Code tab chat.

```
▬▬ ● 28% Roomy   ◔ cache 4m   ▬▬ ▲ 5h 88% fills 29m   ▬▬ 7d 12% resets 11h39m   ◐ 2 thinking · 14 chats   Effort   +
◐ Mellow 2 ▬ ⋯   ✔ Family Tree 1 ▬ ⋯   ○ Templar Archives ⋯   +3 more
```

## Where everything is

| You want | Where |
| --- | --- |
| This chat's context and your plan limits | The first row (the strip) |
| Every chat, and which are thinking or done | The **chats** button in the strip, or `/chats` |
| Your projects | The chips row; **+N more** or **Projects** for the full list |
| One project's chats | Press its chip |
| What Claude is doing right now | A line that appears while Claude works |
| Charts of your limits, and what fills this chat | Press the **5h** or **7d** figure |
| More or less thinking for one reply | **Effort** in the strip |
| Switches for all of it | **+** at the end of the strip |

## The strip

It reads left to right, from **this chat** to **your Claude plan**. Whatever needs attention jumps to the front and gets a highlight.

| Piece | What it means |
| --- | --- |
| **● 28% Roomy** | How full this chat's memory (context) is. The bar has marks at 60% and 80%. |
| Zones | ● **Roomy** under 40% · ◐ **Working** 40–59% · ▲ **Wrap up** 60–79% · ◆ **Hand off** 80%+ |
| **◔ cache 4m** | Minutes left on the prompt cache. A reply before it runs out costs less. **cache cold** means the next reply rereads the whole chat. This is an estimate. |
| **5h 88%** | How much of your 5-hour plan limit is used. Press it for the history. |
| **7d 12%** | How much of your weekly plan limit is used. Press it for the history. |
| **fills 29m** | At this rate, the limit fills in about 29 minutes, before it resets. |
| **resets 11h39m** | You won't fill it at this rate; it resets in 11h39m. |
| ▲ and color | Amber = ahead of an even pace or past 75%. Orange with a highlight = past 90%, or it fills before it resets. |
| The small tick on 5h/7d bars | Even pace: where usage would be if spread evenly over the window. A bar past the tick is ahead of pace. |
| **12m old** and greyed out | The figures are over 10 minutes old. The limits refresh every 5 minutes; the context updates with each reply. |
| **Write handoff** | Appears from 80%. It asks Claude to write a handoff so a fresh chat can continue the work. |

Hover a bar to see its details. The plan limits show only on Pro and Max plans.

## Chat statuses

| Symbol | Word | Meaning |
| --- | --- | --- |
| ◐ | **Thinking** | Claude is working in that chat now. |
| ✔ | **Done** | It finished since you last had it on screen or opened it from here. A ● sits before its title. |
| ○ | **Open** | Nothing running, nothing new. |

The app does not tell a mod when a chat is waiting for your answer, so there is no "Needs you" status.

## All chats

Press the chats button in the strip ("◐ 2 thinking · 14 chats"), or type `/chats`.

- Newest first, grouped by day. Each row: status, title, project, pull request, context, age.
- **Tabs** with counts: All, Thinking, Done, Open.
- **Filter** box: type part of a title or project.
- **Search inside chats**: press Enter in the box, or the button, to find chats that mention the words.
- **Press a title** to switch to that chat. If the switch fails, a note says so; pick the chat in the app's sidebar.
- **Mark all seen** turns every Done chat to Open.
- **Show more** adds 20 older chats.

Only Code tab chats are listed. The Chat tab and cloud chats cannot be reached by a mod.

## Project chips and the drawer

A project is a chat's sidebar group, or its folder when it has no group. Tip: chats that share one folder become separate projects once you file them in sidebar groups.

- A chip shows the project's status symbol, its name, and how many chats are thinking or done. The small bar is the context of its fullest chat.
- **Press a chip** to open its chats under the chips (the drawer). Press it again, or **Close**, to shut it. One project is open at a time.
- **⋯** next to a chip: **Pin first**, **Hide**, or **Hide until active** (it returns while one of its chats is thinking or done).
- **+N more** or **Projects** opens the full list: filter, sort, pin, hide, **Restore** hidden ones, and choose how many chips show (Auto, 5, 8, 12).
- There are no keyboard shortcuts for chips: a mod cannot set Alt+number or Ctrl K, and plain number keys would steal digits you type into an empty message box. Use `/jump` instead.
- `/jump 2` switches to project 2 (its finished chat first, else its newest). `/jump notes` switches to the newest chat whose title or project contains "notes". `/jump` alone lists the numbers.
- **Hide app sidebar** in the drawer collapses the app's own sidebar; press it again to bring it back.

## Activity line

While Claude works, a line shows what it is doing:

```
⚙ Running Bash   7 tool calls (Bash 3, Read 2, Edit 2)   2 agents (Explore)   to-dos 3/7: Write the fix
```

It shows the tool of the current step, the tool calls this turn, running agents, and to-do progress.

## Usage history

Press **5h** or **7d** in the strip.

- **Each limit window**: the solid line is your use, the dotted diagonal is an even pace, and the dashed line shows where it is heading. A "full" mark shows when it would fill before the reset.
- **Last 30 days**: one bar a day, the highest the 5-hour limit reached. Days fill in from when the mod was installed.
- **Weekly limits**: one row for each model's weekly limit.
- **What fills this chat**: messages, tools, skills and so on, as the app reports them.

## Effort

**Effort** in the strip sets how hard Claude thinks for the **next reply only**, then returns to "Chat default". A pick made while Claude is working waits for the reply after that. The activity line shows the effort in use. It does not change the chat's own effort setting. On a model with no effort levels, a note says the pick changed nothing. It hides on a very narrow strip.

## The + button (settings)

Press **+** to open the settings and **−** to close them.

- **Pop-up alerts when** (small notes in the top right of the chat):
  - *this chat passes 80%*: once each time the chat crosses 80%.
  - *5h or 7d use runs ahead of pace*: once per window, when use is more than 10 points ahead of an even pace.
  - *another chat finishes*: when a chat that was thinking stops.
  - *figures are 10 min old*: off by default, since the strip already greys out.
- **Show**: the project chips, and the activity line. **Projects…** and **Usage history…** open those lists.
- **Window glow**: the window edge turns amber from 60% and orange from 80%. The strip's border takes the same color.
  - **Preview 8s** shows the orange glow now, so you can see whether it's visible on your screen.
  - If another mod changes the app's look, the glow stays off in that chat; the border still shows it.
- **Guide** opens this page.
- **Desktop tools ✓** means the mod can read your chat list. **width** is how many characters wide the strip is; it decides what text fits.

Your switches are saved and apply to every chat.

## What is not possible

A terminal row, a tray icon, chats from the Chat tab or the cloud, a "Needs you" status, use by project, global shortcuts, and right-click menus on chips. The README says why for each.
