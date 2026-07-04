# Runs the LOCAL RTL patch (no GitHub download).
# Verifies SHA-256 against a pinned hash so an attacker who replaces patch.ps1
# on disk can't silently sneak code through here either.

$ErrorActionPreference = 'Stop'

$PatchPath   = Join-Path $PSScriptRoot 'patch.ps1'
$PinnedHash  = '66EE80EC87737D2B951EC4696B3210F10494562983BCEDB991E9C67CE5D8740E'

if (-not (Test-Path $PatchPath)) {
    Write-Host "patch.ps1 not found at: $PatchPath" -ForegroundColor Red
    Write-Host "Adjust `$PatchPath in this script if you moved the folder." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    Exit 1
}

Write-Host "`n=== Verifying patch.ps1 integrity ===" -ForegroundColor Cyan
$actual = (Get-FileHash $PatchPath -Algorithm SHA256).Hash
if ($actual -ne $PinnedHash) {
    Write-Host "[!] HASH MISMATCH" -ForegroundColor Red
    Write-Host "    Expected: $PinnedHash" -ForegroundColor Red
    Write-Host "    Actual:   $actual" -ForegroundColor Red
    Write-Host "`nThe local patch.ps1 differs from the version Claude audited."
    Write-Host "Refusing to run. Re-audit the file before updating the pinned hash."
    Read-Host "Press Enter to exit"
    Exit 1
}
Write-Host "[+] Hash matches. Running local patch (will request admin)..." -ForegroundColor Green

# Hand off to the local patch.ps1, elevated, with no GitHub fetch.
Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-NoExit',
    '-ExecutionPolicy','Bypass',
    '-File',"`"$PatchPath`""
)
