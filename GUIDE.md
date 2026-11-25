# Quick guide: the usage strip (code-tab-hud)

The strip sits just above the message box in every Code tab chat. It reads left to right, from **this chat** to **your Claude plan**. Whatever needs attention jumps to the front and gets a highlight.

```
▬▬ ● 28% Roomy   ◔ cache 4m   ▬▬ ▲ 5h 88% fills 29m   ▬▬ 7d 12% resets 11h39m   +
```

## Reading it

| Piece | What it means |
| --- | --- |
| **● 28% Roomy** | How full this chat's memory (context) is. The bar has marks at 60% and 80%. |
| Zones | ● **Roomy** under 40% · ◐ **Working** 40–59% · ▲ **Wrap up** 60–79% · ◆ **Hand off** 80%+ |
| **◔ cache 4m** | Minutes left on the prompt cache. A reply before it runs out costs less. **cache cold** means the next reply rereads the whole chat. This is an estimate. |
| **5h 88%** | How much of your 5-hour plan limit is used. |
| **7d 12%** | How much of your weekly plan limit is used. |
| **fills 29m** | At this rate, the limit fills in about 29 minutes, before it resets. |
| **resets 11h39m** | You won't fill it at this rate; it resets in 11h39m. |
| ▲ and color | Amber = ahead of an even pace or past 75%. Orange with a highlight = past 90%, or it fills before it resets. |
| The small tick on 5h/7d bars | Even pace: where usage would be if spread evenly over the window. A bar past the tick is ahead of pace. |
| **12m old** and greyed out | The figures are over 10 minutes old. They update each time this chat gets a reply. |
| **Write handoff** | Appears from 80%. It asks Claude to write a handoff so a fresh chat can continue the work. |

Hover a bar to see its details. The plan limits show only on Pro and Max plans, after the chat's first reply.

## The + button (settings)

Press **+** to open the settings and **−** to close them.

- **Pop-up alerts when** (small notes in the top right of the chat):
  - *this chat passes 80%*: once each time the chat crosses 80%.
  - *5h or 7d use runs ahead of pace*: once per window, when use is more than 10 points ahead of an even pace.
  - *figures are 10 min old*: off by default, since the strip already greys out.
- **Window glow**: the window edge turns amber from 60% and orange from 80%. The strip's border takes the same color.
  - **Preview 8s** shows the orange glow now, so you can see whether it's visible on your screen.
  - If another mod changes the app's look, the glow stays off in that chat; the border still shows it.
- **Guide** opens this page.
- **Desktop tools ✓** means the mod can read your chat list (for the coming All chats view). **width** is how many characters wide the strip is; it decides what text fits.

Your switches are saved and apply to every chat.

## What is not built yet

These parts of the v1 plan are still to come: the All chats list, project chips, a projects drawer, an activity line, usage history charts, a tray icon, and an effort picker. See the README for status.
