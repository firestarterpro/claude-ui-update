<#
  Pace Orb: an always-on-top glass orb that shows the Claude plan limits.

  Outer ring = 7-day limit, inner ring = 5-hour limit, the number = 5-hour % used,
  the small line under it = time until the 5-hour limit resets. The white tick on
  each ring is where you would be at an even pace, so an arc past its tick is
  ahead of pace. The glow takes the colour of the worse of the two and breathes
  when the current pace runs out before the reset.

  It does not live in a Claude chat: it reads Observatory's /api/limits
  (http://127.0.0.1:8766), which runs `claude -p /usage` on its own schedule.
  If Observatory is not answering, the orb starts it in the tray.

  Click: show or hide the words panel.  Drag: move (position is remembered).
  Right-click: refresh, size, hide for an hour, open Observatory, exit.

  Windows PowerShell 5.1:
    powershell -NoProfile -ExecutionPolicy Bypass -File pace-orb.ps1 -Install    # startup shortcut + start now
    powershell -NoProfile -ExecutionPolicy Bypass -File pace-orb.ps1 -Uninstall  # shortcut to Recycle Bin + stop
    powershell -NoProfile -ExecutionPolicy Bypass -File pace-orb.ps1 -Status     # one line: running? on top?
  -Evidence also saves a small screenshot of the orb's corner every 30 minutes for 24 hours.
#>
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Status,
  [switch]$Evidence,
  [string]$Url = 'http://127.0.0.1:8766/api/limits',
  [string]$ObservatoryExe = 'C:\Templar Archives\Observatory\observatory\app\dist\Observatory.exe'
)

$ErrorActionPreference = 'Stop'
$script:Self = $MyInvocation.MyCommand.Path
$script:StateDir = Join-Path $env:LOCALAPPDATA 'PaceOrb'
$script:StatePath = Join-Path $script:StateDir 'state.json'
$script:LogDir = if (Test-Path 'C:\Templar Archives\logs') { 'C:\Templar Archives\logs' } else { $script:StateDir }
$script:ShortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Pace Orb.lnk'
New-Item -ItemType Directory -Force -Path $script:StateDir | Out-Null

function Get-LogPath { Join-Path $script:LogDir ('pace-orb-{0}.log' -f (Get-Date -Format 'yyyy-MM')) }
function Write-OrbLog([string]$line) {
  try { [IO.File]::AppendAllText((Get-LogPath), ('{0} {1}{2}' -f (Get-Date -Format 's'), $line, [Environment]::NewLine)) } catch {}
}
function Get-OrbProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*pace-orb.ps1*' -and $_.CommandLine -notmatch '-(Install|Uninstall|Status)\b' -and $_.ProcessId -ne $PID })
}
function Get-LaunchArgs([switch]$WithEvidence) {
  $a = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script:Self`""
  if ($WithEvidence) { $a += ' -Evidence' }
  $a
}

# ---------- install / uninstall / status ----------
if ($Status) {
  $procs = Get-OrbProcesses
  $last = if (Test-Path (Get-LogPath)) { Get-Content (Get-LogPath) -Tail 1 } else { 'no log yet' }
  'Pace Orb: {0} running | startup shortcut: {1} | last log: {2}' -f $procs.Count, (Test-Path $script:ShortcutPath), $last
  return
}
if ($Uninstall) {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $out = @()
  foreach ($p in Get-OrbProcesses) { Stop-Process -Id $p.ProcessId -Force; $out += "stopped orb process $($p.ProcessId)" }
  if (Test-Path $script:ShortcutPath) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($script:ShortcutPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
    $out += 'startup shortcut sent to the Recycle Bin'
  } else { $out += 'no startup shortcut found' }
  Write-OrbLog 'uninstalled'
  $out -join [Environment]::NewLine
  return
}
if ($Install) {
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($script:ShortcutPath)
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $lnk.Arguments = Get-LaunchArgs
  $lnk.WorkingDirectory = Split-Path $script:Self
  $lnk.WindowStyle = 7
  $lnk.Description = 'Pace Orb: Claude limits, always on top'
  $lnk.Save()
  foreach ($p in Get-OrbProcesses) { Stop-Process -Id $p.ProcessId -Force; Wait-Process -Id $p.ProcessId -Timeout 5 -ErrorAction SilentlyContinue }
  Start-Process -FilePath $lnk.TargetPath -ArgumentList (Get-LaunchArgs -WithEvidence:$Evidence) -WindowStyle Hidden
  Write-OrbLog "installed (evidence=$([bool]$Evidence))"
  "Pace Orb installed. Startup shortcut: $script:ShortcutPath. Started now$(if ($Evidence) { ' with 24 h evidence shots' })."
  return
}

# ---------- the orb ----------
$created = $false
$script:Mutex = [System.Threading.Mutex]::new($true, 'Local\PaceOrb', [ref]$created)
if (-not $created) { return }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing
Add-Type -Namespace PaceOrb -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
[DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int index, int value);
[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
public struct POINT { public int X; public int Y; public POINT(int x, int y) { X = x; Y = y; } }
'@

$Inv = [Globalization.CultureInfo]::InvariantCulture
$Palette = @{ good = '#0AAC23'; warn = '#FBB315'; serious = '#F18A59'; idle = '#7A8290' }

# Shared with the fetch thread.
$sync = [hashtable]::Synchronized(@{
  Url = $Url; Exe = $ObservatoryExe; Data = $null; Error = $null; FetchedAt = $null
  Force = $false; Stop = $false; Fails = 0; Launched = [datetime]::MinValue; Note = $null
})

$fetch = {
  param($sync)
  while (-not $sync.Stop) {
    try {
      $req = [System.Net.WebRequest]::Create($sync.Url)
      $req.Timeout = 20000
      $req.Proxy = $null
      $resp = $req.GetResponse()
      try { $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } finally { $resp.Close() }
      $claude = ($text | ConvertFrom-Json).tools | Where-Object { $_.id -eq 'claude' } | Select-Object -First 1
      if (-not $claude) { throw 'Observatory has no Claude card' }
      $sync.Data = $claude; $sync.FetchedAt = [datetime]::UtcNow; $sync.Error = $null; $sync.Fails = 0; $sync.Note = $null
    } catch {
      $sync.Error = $_.Exception.Message; $sync.Fails++
      $running = Get-Process -Name 'Observatory', 'AI Control Center' -ErrorAction SilentlyContinue
      if ($sync.Fails -ge 2 -and -not $running -and (Test-Path $sync.Exe) -and ([datetime]::UtcNow - $sync.Launched).TotalMinutes -ge 10) {
        try { Start-Process -FilePath $sync.Exe -ArgumentList '--tray'; $sync.Launched = [datetime]::UtcNow; $sync.Note = 'started Observatory in the tray' } catch { $sync.Note = "could not start Observatory: $($_.Exception.Message)" }
      }
    }
    $wait = if ($sync.Fails -gt 0) { 20 } else { 60 }
    for ($i = 0; $i -lt $wait -and -not $sync.Force -and -not $sync.Stop; $i++) { Start-Sleep -Seconds 1 }
    $sync.Force = $false
  }
}
$rs = [runspacefactory]::CreateRunspace(); $rs.ApartmentState = 'MTA'; $rs.Open()
$worker = [powershell]::Create(); $worker.Runspace = $rs
[void]$worker.AddScript($fetch).AddArgument($sync)
$workerHandle = $worker.BeginInvoke()

# ---------- saved state ----------
$state = @{ left = $null; top = $null; scale = 1.0; expanded = $false; evidenceUntil = $null }
if (Test-Path $script:StatePath) {
  try { (Get-Content $script:StatePath -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value } } catch {}
}
if ($Evidence) { $state.evidenceUntil = (Get-Date).AddHours(24).ToString('o') }
function Save-State { try { ($state | ConvertTo-Json) | Set-Content -Path $script:StatePath -Encoding UTF8 } catch {} }

# ---------- window ----------
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Pace Orb" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False" ResizeMode="NoResize" SizeToContent="WidthAndHeight"
        FontFamily="Segoe UI">
  <StackPanel x:Name="Root" Orientation="Horizontal">
    <StackPanel.LayoutTransform><ScaleTransform ScaleX="1" ScaleY="1"/></StackPanel.LayoutTransform>
    <Grid x:Name="Orb" Width="84" Height="84" Cursor="Hand" FlowDirection="LeftToRight">
      <Ellipse x:Name="Glow" Width="70" Height="70" Opacity="0.45" Fill="#7A8290">
        <Ellipse.Effect><BlurEffect Radius="16"/></Ellipse.Effect>
      </Ellipse>
      <Ellipse Width="64" Height="64" Stroke="#40FFFFFF" StrokeThickness="1">
        <Ellipse.Fill>
          <RadialGradientBrush GradientOrigin="0.35,0.3">
            <GradientStop Color="#F2343B48" Offset="0"/>
            <GradientStop Color="#F2121620" Offset="1"/>
          </RadialGradientBrush>
        </Ellipse.Fill>
      </Ellipse>
      <Canvas Width="84" Height="84">
        <Ellipse Canvas.Left="14" Canvas.Top="14" Width="56" Height="56" Stroke="#2EFFFFFF" StrokeThickness="4"/>
        <Ellipse Canvas.Left="21" Canvas.Top="21" Width="42" Height="42" Stroke="#2EFFFFFF" StrokeThickness="4"/>
        <Path x:Name="ArcSeven" StrokeThickness="4" StrokeStartLineCap="Round" StrokeEndLineCap="Round" Stroke="#7A8290"/>
        <Path x:Name="ArcFive"  StrokeThickness="4" StrokeStartLineCap="Round" StrokeEndLineCap="Round" Stroke="#7A8290"/>
        <Line x:Name="TickSeven" Stroke="#E6FFFFFF" StrokeThickness="1.6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
        <Line x:Name="TickFive"  Stroke="#E6FFFFFF" StrokeThickness="1.6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
      </Canvas>
      <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center" IsHitTestVisible="False">
        <TextBlock x:Name="Big" Text="--" Foreground="#F5F7FA" FontSize="15" FontWeight="SemiBold" HorizontalAlignment="Center" Margin="0,0,0,-3"/>
        <TextBlock x:Name="Small" Text="..." Foreground="#B8C0CC" FontSize="8" HorizontalAlignment="Center"/>
      </StackPanel>
    </Grid>
    <Border x:Name="Panel" Visibility="Collapsed" VerticalAlignment="Center" Margin="2,0,2,0" Padding="10,6,12,6" FlowDirection="LeftToRight"
            CornerRadius="10" Background="#F0141820" BorderBrush="#40FFFFFF" BorderThickness="1">
      <StackPanel>
        <TextBlock x:Name="LineFive"  Foreground="#F5F7FA" FontSize="11.5"/>
        <TextBlock x:Name="PaceFive"  Foreground="#B8C0CC" FontSize="10.5" Margin="0,0,0,4"/>
        <TextBlock x:Name="LineSeven" Foreground="#F5F7FA" FontSize="11.5"/>
        <TextBlock x:Name="PaceSeven" Foreground="#B8C0CC" FontSize="10.5"/>
        <TextBlock x:Name="LineFoot"  Foreground="#8A93A0" FontSize="9.5" Margin="0,4,0,0"/>
      </StackPanel>
    </Border>
  </StackPanel>
</Window>
'@
$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$ui = @{}
foreach ($n in 'Root','Orb','Glow','ArcSeven','ArcFive','TickSeven','TickFive','Big','Small','Panel','LineFive','PaceFive','LineSeven','PaceSeven','LineFoot') { $ui[$n] = $win.FindName($n) }
$ui.Scale = $ui.Root.LayoutTransform

$CX = 42.0; $CY = 42.0; $R7 = 26.0; $R5 = 19.0

function New-ArcGeometry([double]$r, [double]$f) {
  if ($f -le 0.003) { return [Windows.Media.Geometry]::Empty }
  if ($f -ge 0.999) { $f = 0.999 }
  $a = 2 * [Math]::PI * $f
  $x = $CX + $r * [Math]::Sin($a); $y = $CY - $r * [Math]::Cos($a)
  $large = if ($f -gt 0.5) { 1 } else { 0 }
  [Windows.Media.Geometry]::Parse([string]::Format($Inv, 'M {0},{1} A {2},{2} 0 {3} 1 {4},{5}', $CX, ($CY - $r), $r, $large, $x, $y))
}
function Set-Tick($line, [double]$r, [double]$f) {
  if ($f -lt 0 -or $f -gt 1) { $line.Visibility = 'Hidden'; return }
  $line.Visibility = 'Visible'
  $a = 2 * [Math]::PI * $f; $s = [Math]::Sin($a); $c = [Math]::Cos($a)
  $line.X1 = $CX + ($r - 3.5) * $s; $line.Y1 = $CY - ($r - 3.5) * $c
  $line.X2 = $CX + ($r + 3.5) * $s; $line.Y2 = $CY - ($r + 3.5) * $c
}
function Get-Brush([string]$hex, [double]$opacity = 1.0) {
  $b = New-Object Windows.Media.SolidColorBrush ([Windows.Media.ColorConverter]::ConvertFromString($hex))
  $b.Opacity = $opacity; $b
}
function Format-Span([TimeSpan]$t) {
  if ($t.TotalMinutes -lt 1) { return 'now' }
  if ($t.TotalHours -lt 1) { return '{0}m' -f [int][Math]::Floor($t.TotalMinutes) }
  if ($t.TotalDays -lt 1) { return '{0}h {1:00}m' -f [int][Math]::Floor($t.TotalHours), $t.Minutes }
  '{0}d {1}h' -f [int][Math]::Floor($t.TotalDays), $t.Hours
}
function Format-When([datetime]$local) {
  if ($local.Date -eq (Get-Date).Date) { return $local.ToString('h:mm tt') }
  $local.ToString('ddd h:mm tt')
}

# One limit window -> what to draw and say.
function Get-Reading($w, [double]$lengthHours) {
  if (-not $w -or $null -eq $w.usedPct) { return $null }
  $now = [datetime]::UtcNow
  $used = [double]$w.usedPct
  $r = @{ used = $used; fill = [Math]::Min(1.0, $used / 100); tick = -1; level = 'good'; urgent = $false; reset = $null; pace = '' }
  if ($w.resetsAt) {
    $reset = [datetime]::Parse($w.resetsAt, $Inv, 'AdjustToUniversal,AssumeUniversal')
    $r.reset = $reset
    $length = [TimeSpan]::FromHours($lengthHours)
    $elapsed = ($now - ($reset - $length)).TotalSeconds / $length.TotalSeconds
    $elapsed = [Math]::Max(0.0, [Math]::Min(1.0, $elapsed))
    $r.tick = $elapsed
    $projected = if ($elapsed -ge 0.08) { $used / $elapsed } else { $null }
    $hits = $w.pace -and $w.pace.hitsBeforeReset
    if ($used -ge 100) { $r.pace = 'used up; comes back at the reset' }
    elseif ($hits) {
      $eta = [datetime]::Now.AddMilliseconds([double]$w.pace.etaMs)
      $r.pace = 'last hour''s pace runs out near {0}' -f (Format-When $eta)
    } elseif ($null -ne $projected) {
      $word = if ($used -gt $elapsed * 100 + 2) { 'ahead of pace' } elseif ($used -lt $elapsed * 100 - 2) { 'under pace' } else { 'on pace' }
      $r.pace = if ($projected -ge 100) { "$word, at this rate runs out before the reset" } else { '{0}, at this rate ~{1}% by the reset' -f $word, [int][Math]::Round($projected) }
    } else { $r.pace = 'window just started' }
    $r.urgent = ($used -lt 100) -and ($hits -or ($null -ne $projected -and $projected -ge 100))
    if ($used -ge 90 -or $r.urgent) { $r.level = 'serious' }
    elseif ($used -ge 70 -or ($null -ne $projected -and $projected -ge 85)) { $r.level = 'warn' }
  } elseif ($used -ge 90) { $r.level = 'serious' } elseif ($used -ge 70) { $r.level = 'warn' }
  $r
}

$script:Pulsing = $false
$script:LastTip = ''
$script:Summary = 'no reading yet'
function Update-Orb {
  $d = $sync.Data
  $now = [datetime]::UtcNow
  $stale = $true; $five = $null; $seven = $null; $others = @()
  if ($d) {
    $five  = Get-Reading ($d.windows | Where-Object { $_.id -eq '5-hour' } | Select-Object -First 1) 5
    $seven = Get-Reading ($d.windows | Where-Object { $_.id -eq 'weekly' } | Select-Object -First 1) 168
    $others = @($d.windows | Where-Object { $_.id -ne '5-hour' -and $_.id -ne 'weekly' -and $null -ne $_.usedPct })
    $age = if ($d.observedAt) { ($now - [datetime]::Parse($d.observedAt, $Inv, 'AdjustToUniversal,AssumeUniversal')).TotalMinutes } else { 999 }
    $fetchAge = if ($sync.FetchedAt) { ($now - $sync.FetchedAt).TotalMinutes } else { 999 }
    $stale = $d.stale -or $age -gt 45 -or $fetchAge -gt 5
  }
  $dim = if ($stale) { 0.45 } else { 1.0 }
  $rank = @{ good = 0; warn = 1; serious = 2 }
  $worst = 'idle'
  foreach ($x in @($five, $seven)) { if ($x -and ($worst -eq 'idle' -or $rank[$x.level] -gt $rank[$worst])) { $worst = $x.level } }
  if ($stale -and $worst -ne 'idle') { $worst = 'idle' }

  foreach ($pair in @(@($five, $ui.ArcFive, $ui.TickFive, $R5), @($seven, $ui.ArcSeven, $ui.TickSeven, $R7))) {
    $x = $pair[0]
    if ($x) {
      $pair[1].Data = New-ArcGeometry $pair[3] $x.fill
      $pair[1].Stroke = Get-Brush $Palette[$x.level] $dim
      Set-Tick $pair[2] $pair[3] $x.tick
    } else { $pair[1].Data = [Windows.Media.Geometry]::Empty; $pair[2].Visibility = 'Hidden' }
  }

  if ($five) {
    $ui.Big.Text = '{0}%' -f [int][Math]::Round($five.used)
    $ui.Small.Text = if ($stale) { 'old' } elseif ($five.reset) { Format-Span ($five.reset - $now) } else { '5h' }
  } else {
    $ui.Big.Text = '--'
    $ui.Small.Text = if ($sync.Error) { 'off' } else { '...' }
  }
  $ui.Big.Opacity = $dim

  $ui.Glow.Fill = Get-Brush $Palette[$worst]
  $urgent = (-not $stale) -and (($five -and $five.urgent) -or ($seven -and $seven.urgent))
  if ($urgent -and -not $script:Pulsing) {
    $anim = New-Object Windows.Media.Animation.DoubleAnimation(0.25, 0.95, [Windows.Duration]::new([TimeSpan]::FromSeconds(1.6)))
    $anim.AutoReverse = $true; $anim.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
    $ui.Glow.BeginAnimation([Windows.UIElement]::OpacityProperty, $anim); $script:Pulsing = $true
  } elseif (-not $urgent -and $script:Pulsing) {
    $ui.Glow.BeginAnimation([Windows.UIElement]::OpacityProperty, $null); $script:Pulsing = $false
  }
  if (-not $script:Pulsing) { $ui.Glow.Opacity = if ($worst -eq 'idle') { 0.25 } else { 0.5 } }

  # Words: never colour alone.
  $line = {
    param($label, $x)
    if (-not $x) { return @("$label  no reading", '') }
    $when = if ($x.reset) { 'resets {0} (in {1})' -f (Format-When $x.reset.ToLocalTime()), (Format-Span ($x.reset - $now)) } else { 'no reset time' }
    @(('{0}  {1}%  {2}' -f $label, [int][Math]::Round($x.used), $when), $x.pace)
  }
  $l5 = & $line '5-hour' $five; $l7 = & $line '7-day' $seven
  $ui.LineFive.Text = $l5[0]; $ui.PaceFive.Text = $l5[1]; $ui.LineSeven.Text = $l7[0]; $ui.PaceSeven.Text = $l7[1]
  $foot = @()
  foreach ($o in $others) { $foot += '{0} {1}%' -f $o.label, [int][Math]::Round([double]$o.usedPct) }
  if (-not $d -and $sync.Error) { $foot += "Observatory not answering: $($sync.Error)" }
  elseif (-not $d) { $foot += 'waiting for Observatory' }
  elseif ($stale) { $foot += 'reading is old; Observatory has not checked Claude recently' }
  else { $foot += 'checked {0} via Observatory' -f ([datetime]::Parse($d.observedAt, $Inv, 'AdjustToUniversal,AssumeUniversal').ToLocalTime().ToString('h:mm tt')) }
  if ($sync.Note) { $foot += $sync.Note }
  $ui.LineFoot.Text = $foot -join '  |  '
  $tip = @($l5[0], $l5[1], $l7[0], $l7[1]) + $foot
  $tipText = ($tip | Where-Object { $_ }) -join [Environment]::NewLine
  if ($tipText -ne $script:LastTip) { $ui.Orb.ToolTip = $tipText; $script:LastTip = $tipText }

  $s5 = if ($five) { '{0}%' -f [int]$five.used } else { '-' }
  $s7 = if ($seven) { '{0}%' -f [int]$seven.used } else { '-' }
  $script:Summary = '5h={0} 7d={1} level={2} stale={3} pulse={4}' -f $s5, $s7, $worst, $stale, $script:Pulsing
}

# ---------- placement, topmost, evidence ----------
$script:Hwnd = [IntPtr]::Zero
$script:HideUntil = [datetime]::MinValue
function Get-ScreenBox {
  $src = [Windows.PresentationSource]::FromVisual($win)
  $tl = $win.PointToScreen([Windows.Point]::new(0, 0))
  $m = $src.CompositionTarget.TransformToDevice
  @{ X = [int]$tl.X; Y = [int]$tl.Y; W = [int]($win.ActualWidth * $m.M11); H = [int]($win.ActualHeight * $m.M22); OrbW = [int](84 * $ui.Scale.ScaleX * $m.M11) }
}
function Test-OnTop {
  # The window the user would actually see at the orb's centre: ours, or something covering it?
  if ($script:Hwnd -eq [IntPtr]::Zero -or -not $win.IsVisible) { return 'hidden' }
  $b = Get-ScreenBox
  $hit = [PaceOrb.Win]::WindowFromPoint([PaceOrb.Win+POINT]::new($b.X + [int]($b.OrbW / 2), $b.Y + [int]($b.OrbW / 2)))
  if ([PaceOrb.Win]::GetAncestor($hit, 2) -eq $script:Hwnd) { 'yes' } else { 'covered' }
}
function Set-TopMost {
  if ($script:Hwnd -ne [IntPtr]::Zero -and $win.IsVisible -and -not $menu.IsOpen) { [void][PaceOrb.Win]::SetWindowPos($script:Hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0013) }
}
function Save-Shot {
  if (-not $state.evidenceUntil -or -not $win.IsVisible) { return }
  if ((Get-Date) -gt [datetime]::Parse($state.evidenceUntil)) { return }
  try {
    $dir = Join-Path $script:LogDir 'pace-orb-shots'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $b = Get-ScreenBox; $pad = 60
    $bmp = New-Object System.Drawing.Bitmap ($b.W + 2 * $pad), ($b.H + 2 * $pad)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.X - $pad, $b.Y - $pad, 0, 0, $bmp.Size)
    $g.Dispose()
    $bmp.Save((Join-Path $dir ('{0}.png' -f (Get-Date -Format 'yyyyMMdd-HHmm'))), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } catch { Write-OrbLog "shot failed: $($_.Exception.Message)" }
}
function Write-Heartbeat([string]$why) {
  $box = if ($win.IsVisible) { $b = Get-ScreenBox; '{0},{1} {2}x{3}' -f $b.X, $b.Y, $b.W, $b.H } else { '-' }
  $ex = if ($script:Hwnd -ne [IntPtr]::Zero) { [PaceOrb.Win]::GetWindowLong($script:Hwnd, -20) } else { 0 }
  $err = if ($sync.Error) { " error=`"$($sync.Error)`"" } else { '' }
  Write-OrbLog ('{0} pid={1} visible={2} topmostFlag={3} onTop={4} box={5} {6}{7}' -f $why, $PID, $win.IsVisible, (($ex -band 0x8) -ne 0), (Test-OnTop), $box, $script:Summary, $err)
}

$wa = [Windows.SystemParameters]::WorkArea
$vs = @{ L = [Windows.SystemParameters]::VirtualScreenLeft; T = [Windows.SystemParameters]::VirtualScreenTop
         R = [Windows.SystemParameters]::VirtualScreenLeft + [Windows.SystemParameters]::VirtualScreenWidth
         B = [Windows.SystemParameters]::VirtualScreenTop + [Windows.SystemParameters]::VirtualScreenHeight }
$scale = [double]$state.scale; if ($scale -lt 0.6 -or $scale -gt 2) { $scale = 1.0 }
$ui.Scale.ScaleX = $scale; $ui.Scale.ScaleY = $scale
$left = $state.left; $top = $state.top
if ($null -eq $left -or $left -lt $vs.L -or $left -gt ($vs.R - 40) -or $top -lt $vs.T -or $top -gt ($vs.B - 40)) {
  $left = $wa.Right - 84 * $scale - 12; $top = $wa.Bottom - 84 * $scale - 12
}
$state.left = $left; $state.top = $top
if ($state.expanded) { $ui.Panel.Visibility = 'Visible' }

# $state.left/top is where the orb itself sits. With the panel open on the right half of
# the screen, the panel goes on the orb's left so it never runs off the edge.
function Get-OrbWidth { 84 * $ui.Scale.ScaleX }
function Set-Placement {
  $open = $ui.Panel.Visibility -eq 'Visible'
  $mid = [Windows.SystemParameters]::VirtualScreenLeft + [Windows.SystemParameters]::VirtualScreenWidth / 2
  $flip = $open -and ($state.left + (Get-OrbWidth) / 2 -gt $mid)
  $ui.Root.FlowDirection = if ($flip) { 'RightToLeft' } else { 'LeftToRight' }
  $w = if ($win.ActualWidth -gt 0) { $win.ActualWidth } else { Get-OrbWidth }
  $win.Left = if ($flip) { $state.left - ($w - (Get-OrbWidth)) } else { $state.left }
  $win.Top = $state.top
}
function Get-OrbLeft {
  if ($ui.Root.FlowDirection -eq 'RightToLeft') { $win.Left + ($win.ActualWidth - (Get-OrbWidth)) } else { $win.Left }
}
function Test-Bounds {
  # Monitor unplugged or resolution changed: pull the orb back on screen.
  $r = [Windows.SystemParameters]::VirtualScreenLeft + [Windows.SystemParameters]::VirtualScreenWidth
  $bt = [Windows.SystemParameters]::VirtualScreenTop + [Windows.SystemParameters]::VirtualScreenHeight
  if ($state.left -gt $r - 40 -or $state.top -gt $bt - 40 -or $state.left -lt [Windows.SystemParameters]::VirtualScreenLeft - 20 -or $state.top -lt [Windows.SystemParameters]::VirtualScreenTop - 20) {
    $w2 = [Windows.SystemParameters]::WorkArea
    $state.left = $w2.Right - (Get-OrbWidth) - 12; $state.top = $w2.Bottom - (Get-OrbWidth) - 12
    Set-Placement; Save-State; Write-Heartbeat 'moved-back-on-screen'
  }
}
Set-Placement

$win.Add_SourceInitialized({
  $script:Hwnd = (New-Object Windows.Interop.WindowInteropHelper $win).Handle
  # Tool window: no Alt-Tab entry.
  $ex = [PaceOrb.Win]::GetWindowLong($script:Hwnd, -20)
  [void][PaceOrb.Win]::SetWindowLong($script:Hwnd, -20, ($ex -bor 0x80))
})

# Click toggles the panel, drag moves.
$ui.Orb.Add_MouseLeftButtonDown({
  param($s, $e)
  $l0 = $win.Left; $t0 = $win.Top
  try { $win.DragMove() } catch {}
  if ([Math]::Abs($win.Left - $l0) -lt 3 -and [Math]::Abs($win.Top - $t0) -lt 3) {
    $ui.Panel.Visibility = if ($ui.Panel.Visibility -eq 'Visible') { 'Collapsed' } else { 'Visible' }
    $state.expanded = ($ui.Panel.Visibility -eq 'Visible')
  } else {
    $state.left = Get-OrbLeft; $state.top = $win.Top
  }
  Save-State
})
$win.Add_SizeChanged({ Set-Placement })

# Right-click menu.
$menu = New-Object Windows.Controls.ContextMenu
function Add-Item([string]$text, [scriptblock]$action) {
  $i = New-Object Windows.Controls.MenuItem; $i.Header = $text; $i.Add_Click($action); [void]$menu.Items.Add($i)
}
Add-Item 'Refresh now' { try { $r = [System.Net.WebRequest]::Create(($sync.Url -replace '/api/limits.*$', '/api/limits/refresh?tool=claude')); $r.Method = 'POST'; $r.Proxy = $null; $r.ContentLength = 0; $r.Timeout = 60000; [void]$r.BeginGetResponse($null, $null) } catch {}; $sync.Force = $true }
Add-Item 'Open Observatory' { if (Test-Path $sync.Exe) { Start-Process -FilePath $sync.Exe } else { Start-Process ($sync.Url -replace '/api/limits.*$', '/') } }
[void]$menu.Items.Add((New-Object Windows.Controls.Separator))
foreach ($sz in @(@('Small', 0.8), @('Normal', 1.0), @('Large', 1.3))) {
  $i = New-Object Windows.Controls.MenuItem; $i.Header = "Size: $($sz[0])"; $i.Tag = $sz[1]
  $i.Add_Click({ param($s, $e) $ui.Scale.ScaleX = [double]$s.Tag; $ui.Scale.ScaleY = [double]$s.Tag; $state.scale = [double]$s.Tag; Save-State; Set-Placement })
  [void]$menu.Items.Add($i)
}
Add-Item 'Hide for 1 hour' { $script:HideUntil = (Get-Date).AddHours(1); $win.Hide(); Write-Heartbeat 'hidden-by-user' }
[void]$menu.Items.Add((New-Object Windows.Controls.Separator))
Add-Item 'Exit (starts again at sign-in)' { $win.Close() }
$ui.Orb.ContextMenu = $menu

# Timers: 1 s for the countdown and redraw, 5 s topmost guard, 5 min heartbeat, 30 min shot.
$script:Ticks = 0
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(1)
$timer.Add_Tick({
  try {
    $script:Ticks++
    if (-not $win.IsVisible -and (Get-Date) -ge $script:HideUntil) { $win.Show(); Write-Heartbeat 'shown-again' }
    Update-Orb
    if ($script:Ticks % 5 -eq 0) { Set-TopMost; Test-Bounds }
    if ($script:Ticks % 300 -eq 3) { Write-Heartbeat 'heartbeat' }
    if ($script:Ticks % 1800 -eq 20) { Save-Shot }
  } catch { if ($script:Ticks % 60 -eq 0) { Write-OrbLog "tick error: $($_.Exception.Message)" } }
})
$win.Add_ContentRendered({ Update-Orb; Write-Heartbeat 'started'; $timer.Start() })
$win.Add_Closed({ $timer.Stop(); $sync.Stop = $true; Save-State; Write-OrbLog "exit pid=$PID" })

Save-State
[void]$win.ShowDialog()
$sync.Stop = $true
try { $worker.EndInvoke($workerHandle) } catch {}
$worker.Dispose(); $rs.Close()
$script:Mutex.ReleaseMutex()
