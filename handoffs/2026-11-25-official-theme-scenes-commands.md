# Official theme scenes (theme-examples 0.6.0)

Checked 2026-11-25 against anthropics/claude-plugins-official @ 6985b2d (2026-11-24).

## Install (Windows PowerShell 5.1, run it yourself)

Backs up your Claude plugin settings to `C:\Templar Archives\backups\`, adds the official marketplace if it is missing, warns if the older `desktop-themes` copy is installed, installs at user scope, and copies the whole log to your clipboard.

```powershell
& { $ErrorActionPreference='Continue'; $log=New-Object System.Collections.Generic.List[string]; function Invoke-ClaudeStep([string[]]$a) { $o=(& claude @a 2>&1 | ForEach-Object { "$_" }) -join "`r`n"; $log.Add("> claude $($a -join ' ')  [exit $LASTEXITCODE]`r`n$o"); $o }; try { if(-not (Get-Command claude -ErrorAction SilentlyContinue)){ throw 'claude CLI not found on PATH' }; $bk="C:\Templar Archives\backups\claude-$(Get-Date -Format yyyyMMdd-HHmmss)-theme-examples"; New-Item -ItemType Directory -Force -Path $bk | Out-Null; foreach($f in 'settings.json','plugins\installed_plugins.json','plugins\known_marketplaces.json'){ $p=Join-Path "$env:USERPROFILE\.claude" $f; if(Test-Path $p){ Copy-Item $p (Join-Path $bk ($f -replace '\\','_')); $log.Add("backed up $f") } }; $log.Add("backup folder: $bk"); if((Invoke-ClaudeStep @('plugin','marketplace','list')) -notmatch 'claude-plugins-official'){ Invoke-ClaudeStep @('plugin','marketplace','add','anthropics/claude-plugins-official') | Out-Null }; if((Invoke-ClaudeStep @('plugin','list')) -match 'desktop-themes'){ $log.Add('WARNING: desktop-themes is installed. Turn it off first: claude plugin disable desktop-themes') }; Invoke-ClaudeStep @('plugin','install','theme-examples@claude-plugins-official','--scope','user') | Out-Null; Invoke-ClaudeStep @('plugin','list') | Out-Null } catch { $log.Add("ERROR: $($_.Exception.Message)") }; $out=$log -join "`r`n`r`n"; $out | Set-Clipboard; $out }
```

## Remove (turns it off, deletes nothing)

```powershell
& { $ErrorActionPreference='Continue'; $o=(& claude plugin disable theme-examples@claude-plugins-official --scope user 2>&1 | ForEach-Object { "$_" }) -join "`r`n"; $out="> claude plugin disable theme-examples  [exit $LASTEXITCODE]`r`n$o"; $out | Set-Clipboard; $out }
```

Turn it back on later with `claude plugin enable theme-examples@claude-plugins-official`. A full `claude plugin uninstall ... --keep-data` also exists; it removes the downloaded copy (re-downloadable) but keeps your saved theme picks.

## Use

1. Restart the Claude desktop app, then open a **Code** chat (scenes never draw in project Threads chats).
2. Type `/custom-theme` for the picker card with previews, or `/custom-theme list`.
3. `/custom-theme koi-pond` sets it for the project; add `session` for this chat only. `/custom-theme off` clears.
4. Send a message: a new chat shows no scene until its first message.
5. `/fireworks` for a show; one also goes off when Claude says "merged" (`/fireworks auto off` stops that).
6. Koi Pond and Falling Sand have sound: turn it on with the speaker in the chat's title bar.

## With code-tab-hud 1.0.0

- The HUD's strip, chats list, chips, drawer, activity line and alerts keep working: they are panels, not the backdrop. (Read in code; not run on your PC.)
- The HUD's orange **edge tint** also uses the backdrop. A chat holds one backdrop, so when a scene is set in a chat, the HUD steps aside there for that chat (its `theme.set` observer marks the tint "yielded"; the tint's "Preview 8s" button then says "Another mod set this chat's look"). Chats with no scene keep the tint. (Read in code; not run on your PC.)
- Scenes, like the HUD, draw only while that Code chat's process is alive.
