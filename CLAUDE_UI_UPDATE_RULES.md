# Claude UI Update project rules

Shared stack: follow [firestarterpro/stacks-attacks `AGENTS.md`](https://github.com/firestarterpro/stacks-attacks/blob/main/AGENTS.md) (local clone `C:\Templar Archives\Cybernetics Core\stacks-attacks\AGENTS.md`). The project registry is STACKS.md → Projects. This file adds only what is specific to Claude UI Update.
Status: `README.md`

## What this repo is

A plugin marketplace of mods for the Claude desktop app's Code tab (currently `code-tab-hud`), built for a portrait monitor. Local clone: `C:\Templar Archives\Cybernetics Core\claude-ui-update`.

## Working here

- Each mod lives under `plugins/`; bump its version in `.claude-plugin/plugin.json` and the README "Mods" list together.
- How to read the HUD is in `GUIDE.md`. Keep README and GUIDE in step with the shipped version.
- Earlier design and debugging notes are in stacks-attacks `handoffs/2026-11-25-claude-ui-*.md`.
- Save the reasoning behind decisions as a dated handoff in `docs/handoffs/` (create it on first use); cross-project decisions go in stacks-attacks `handoffs/`.
- If this project moves, is renamed or changes its status file, update its row in stacks-attacks STACKS.md → Projects and run `python tools\project-sync-check.py` there.
