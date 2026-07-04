# Claude Desktop RTL - one-line installer.
#   irm https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1 | iex
#
# Downloads the WHOLE repository (engine payload + injector + patcher) from your
# own GitHub, extracts it to a temp folder, and launches windows\patch.ps1 from
# there. Nothing is fetched piecemeal and nothing comes from any other repo; the
# patcher self-elevates if your install needs admin.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

Write-Host "Launching patcher: $($Patch.FullName)" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "`"$($Patch.FullName)`""
