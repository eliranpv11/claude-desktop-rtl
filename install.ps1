# Claude Desktop RTL - one-line installer (single window).
#   irm https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1 | iex
#
# Everything runs in ONE window. If the shell is not elevated, a single UAC
# prompt opens exactly one elevated window that performs the whole install --
# nothing cascades into extra windows. Downloads the WHOLE repository (engine
# payload + injector + patcher) from your own GitHub and runs windows\patch.ps1
# in-process. Nothing is fetched piecemeal and nothing comes from any other repo.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$SelfUrl = 'https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1'

# --- Elevation ----------------------------------------------------------------
# Installing into an MSIX package under C:\Program Files\WindowsApps requires
# Administrator rights. Windows (UAC) cannot elevate an already-open, non-admin
# window in place -- elevation always creates a new process. So:
#   * If you START this from an elevated PowerShell (Run as administrator), the
#     ENTIRE install runs in that ONE window -- no second window ever opens.
#   * If you start it non-elevated, exactly ONE elevated window opens and does
#     everything; this original window is then free to close.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host ''
    Write-Host '  Administrator rights are required to patch the Claude MSIX package.' -ForegroundColor Yellow
    Write-Host '  Windows cannot elevate this window in place, so one elevated window' -ForegroundColor Yellow
    Write-Host '  will open and run the whole install. (For a true single-window run,' -ForegroundColor DarkGray
    Write-Host '  start PowerShell with "Run as administrator" and paste the command.)' -ForegroundColor DarkGray
    Write-Host ''
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit',
        '-Command', "`$host.UI.RawUI.WindowTitle='Claude Desktop RTL (installer)'; irm $SelfUrl | iex"
    )
    Write-Host '  Elevated window opened. You can close this one.' -ForegroundColor Green
    return
}

$Zip = Join-Path $env:TEMP 'claude-desktop-rtl.zip'
$Dst = Join-Path $env:TEMP 'claude-desktop-rtl-src'
$Url = 'https://github.com/eliranpv11/claude-desktop-rtl/archive/refs/heads/main.zip'

Write-Host 'Downloading Claude RTL from GitHub...' -ForegroundColor Cyan
Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing

if (Test-Path $Dst) { Remove-Item $Dst -Recurse -Force }
Expand-Archive -Path $Zip -DestinationPath $Dst -Force

$Patch = Get-ChildItem -Path $Dst -Recurse -Filter 'patch.ps1' |
    Where-Object { $_.FullName -match '[\\/]windows[\\/]patch\.ps1$' } |
    Select-Object -First 1
if (-not $Patch) { throw 'windows\patch.ps1 not found in the downloaded repository.' }

# Run the patcher IN THIS SAME (already-elevated) window -- no new process, no
# second window. patch.ps1 sees admin and never re-elevates.
Write-Host "Running patcher: $($Patch.FullName)`n" -ForegroundColor Cyan
& $Patch.FullName
