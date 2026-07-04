# Runs the LOCAL Claude RTL patcher (windows\patch.ps1) after verifying its
# SHA-256 against a pinned value, so a tampered local copy cannot run unnoticed.
# This is a convenience for running from a trusted local clone; the patcher
# self-elevates if your install needs admin.

$ErrorActionPreference = 'Stop'

$PatchPath  = Join-Path $PSScriptRoot 'windows\patch.ps1'
$PinnedHash = 'F34E1D16BB3223257039758DD61948DAF9C87D8417F5B6FB7CDBA9C962B02E46'

if (-not (Test-Path $PatchPath)) {
    Write-Host "patch.ps1 not found at: $PatchPath" -ForegroundColor Red
    Read-Host 'Press Enter to exit'; Exit 1
}

Write-Host "`n=== Verifying patch.ps1 integrity ===" -ForegroundColor Cyan
$actual = (Get-FileHash $PatchPath -Algorithm SHA256).Hash
if ($actual -ne $PinnedHash) {
    Write-Host '[!] HASH MISMATCH' -ForegroundColor Red
    Write-Host "    Expected: $PinnedHash" -ForegroundColor Red
    Write-Host "    Actual:   $actual" -ForegroundColor Red
    Write-Host 'Refusing to run. Re-audit patch.ps1 and update the pinned hash.'
    Read-Host 'Press Enter to exit'; Exit 1
}
Write-Host '[+] Hash matches. Launching patcher...' -ForegroundColor Green

& powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "`"$PatchPath`""
