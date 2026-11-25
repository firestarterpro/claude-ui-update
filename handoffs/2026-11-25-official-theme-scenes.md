# 2026-11-25: Try official theme scenes in the Claude window

## Decision
The owner chose "Also try official scenes in Claude" (background effects inside the Claude window, beyond the desktop orb). First step is to try Anthropic's `theme-examples` plugin as-is, not to design custom scenes.

## Why this plugin
- Official, Apache-2.0, 38 scenes with a picker (`/custom-theme`), 18 pointer-interactive shader scenes, sound on Koi Pond and Falling Sand, fireworks. Verified from its README and manifest at anthropics/claude-plugins-official @ 6985b2d (v0.6.0).
- It sends nothing anywhere and stores only theme names per project/session (its README).

## Coexistence with code-tab-hud 1.0.0
- One backdrop per chat. The HUD's edge tint uses `$.theme.set` backdrops; theme-examples uses `$.theme.set` too (older engines: `$.ui.backdrop`).
- The HUD observes `theme.set` and marks its tint "yielded" for that chat when another plugin sets a look, so the scene wins and the HUD stops repainting or clearing it. HUD panels are unaffected.
- Verified by reading both sources; not runtime-tested on the owner's PC. Unknown: whether the HUD observer sees the older `$.ui.backdrop` path (only matters on older app builds).

## Install / remove
Commands (PowerShell 5.1, single `& { }`, clipboard) are in the project file `guides/official-theme-scenes.md`. Remove uses `claude plugin disable` so nothing is deleted.

## Next
Owner tries scenes, then says which (if any) to keep or to build context-reactive effects on.
