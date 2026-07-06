# Claude Desktop RTL - one-line installer (single window).
#   irm https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1 | iex
#
# Everything runs in ONE window. If the shell is not elevated, a single UAC
# prompt opens exactly one elevated window that performs the whole install --
# nothing cascades into extra windows. Fetches only the THREE files the patcher
# needs (patcher + injector + prebuilt payload, ~100 KB) straight from your own
# GitHub -- no whole-repo zip and no slow Expand-Archive -- then runs
# windows\patch.ps1 in-process. Nothing comes from any other repo.

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

# Fetch only what the patcher needs, laid out as <root>\windows\ and <root>\dist\
# so patch.ps1 resolves its payload/injector by its usual relative paths.
$Dst  = Join-Path $env:TEMP 'claude-desktop-rtl-src'
$Base = 'https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main'

if (Test-Path $Dst) { Remove-Item $Dst -Recurse -Force }
$null = New-Item -ItemType Directory -Force -Path (Join-Path $Dst 'windows'), (Join-Path $Dst 'dist')

$Files = @(
    @{ Url = "$Base/windows/patch.ps1";  Path = Join-Path $Dst 'windows\patch.ps1'  },
    @{ Url = "$Base/windows/inject.mjs"; Path = Join-Path $Dst 'windows\inject.mjs' },
    @{ Url = "$Base/dist/payload.js";    Path = Join-Path $Dst 'dist\payload.js'    }
)

Write-Host 'Downloading Claude RTL (3 files)...' -ForegroundColor Cyan
foreach ($f in $Files) {
    Invoke-WebRequest -Uri $f.Url -OutFile $f.Path -UseBasicParsing
    if (-not (Test-Path $f.Path) -or (Get-Item $f.Path).Length -eq 0) {
        throw "download failed or empty: $($f.Url)"
    }
}

$Patch = Join-Path $Dst 'windows\patch.ps1'

# Run the patcher IN THIS SAME (already-elevated) window -- no new process, no
# second window. patch.ps1 sees admin and never re-elevates.
Write-Host "Running patcher: $Patch`n" -ForegroundColor Cyan
& $Patch
