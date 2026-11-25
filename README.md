# Claude UI Update

Mods for the Claude desktop app's Code tab, built for a portrait monitor (about 1080 px wide). This repository is a plugin marketplace, so it can hold more mods as they come.

## Mods

### code-tab-hud (v0.1.0)

A one-line strip above the message box:

- **Context** for the open chat: a bar with marks at 60 and 80, the %, and a zone with a symbol plus a word (● Roomy under 40, ◐ Working, ▲ Wrap up from 60, ◆ Hand off from 80).
- **Prompt cache**: a ring counting down the 5 minutes since the last reply (an estimate).
- **5h and 7d limits**: bars with an even-pace mark, "resets in" or, when the window would fill first, "full in ~X" (a straight-line estimate). ▲ marks a window ahead of pace.
- **Write handoff** button at 80% context.
- Greys out when the figures are over 10 minutes old.
- **Toasts** (switches under ⚙): context 80%, limit ahead of pace, stale data (off by default).
- **Edge tint**: amber window edge from 60% context, orange from 80%, with an off switch.

The limit figures exist only on Pro and Max plans, after the chat's first reply.

## Install

In a terminal session of Claude Code:

```
/plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session, Code tab included.

From a shell:

```
claude plugin install code-tab-hud --marketplace firestarterpro/claude-ui-update
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `firestarterpro/claude-ui-update`, then Add plugin.

A private repository installs only on a machine that holds a git credential for github.com (`gh auth login`, then `gh auth setup-git`).

## Develop

```
claude plugin validate ./plugins/code-tab-hud
claude plugin test ./plugins/code-tab-hud
```

Design notes and the feasibility map live in `firestarterpro/stacks-attacks`, `handoffs/2026-11-25-claude-ui-mod.md`.
