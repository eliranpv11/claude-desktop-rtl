# Disables the RTL patch auto-updater (Scheduled Task).
# Run as Administrator: right-click -> "Run with PowerShell" or via elevated terminal.

$ErrorActionPreference = 'Stop'

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "Re-launching elevated..." -ForegroundColor Yellow
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-NoExit","-File","`"$PSCommandPath`""
    Exit
}

Write-Host "`n=== Disabling Claude RTL auto-updater ===" -ForegroundColor Cyan

$task = Get-ScheduledTask -TaskName 'ClaudeRtlPatchWatcher' -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName 'ClaudeRtlPatchWatcher' -Confirm:$false
    Write-Host "[+] Scheduled task removed." -ForegroundColor Green
} else {
    Write-Host "[*] No scheduled task found (already disabled)." -ForegroundColor Gray
}

$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Update Claude RTL.lnk'
if (Test-Path $shortcut) {
    Remove-Item -LiteralPath $shortcut -Force
    Write-Host "[+] Desktop shortcut removed (it fetched from GitHub)." -ForegroundColor Green
} else {
    Write-Host "[*] No 'Update Claude RTL' shortcut on desktop." -ForegroundColor Gray
}

Write-Host "`nDone. Press any key to close." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
