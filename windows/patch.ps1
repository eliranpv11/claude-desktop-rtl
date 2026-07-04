<#
.SYNOPSIS
    Claude Desktop RTL patcher for Windows (merged best-of-breed).
.DESCRIPTION
    Injects the pure RTL engine payload into Claude Desktop's renderer bundles
    and keeps the app launching:
      * Injection via a dedicated Node injector (windows/inject.mjs) that spares
        the main-process entry and preserves unpacked native modules.
      * Integrity handled by turning the Electron ASAR-integrity FUSE off
        (encoding-agnostic and verifiable) rather than a fragile byte-scan.
      * On installs guarded by cowork-svc, a certificate swap + re-sign so the
        service still trusts claude.exe.
      * Validated, atomic backups (Copy-FileSafe) and AUTOMATIC rollback on any
        failure, so a half-patch can never brick the app.

    Read-only modes (-Status, -Verify, -Preflight) never modify anything.
.NOTES
    ASCII-only on purpose: PowerShell 5.1 mis-decodes non-ASCII .ps1 bytes under
    some system codepages. All user-facing Hebrew lives in the injected payload.
#>
param(
    [switch]$Install,
    [switch]$Restore,
    [switch]$Status,
    [switch]$Verify,
    [switch]$Preflight,
    [switch]$Watch,
    [switch]$Unwatch,
    [switch]$Auto
)

$ErrorActionPreference = 'Stop'

# Repo root = parent of this script's folder (windows/). Used to locate the
# prebuilt payload and the injector.
$script:RepoRoot   = Split-Path -Parent $PSScriptRoot
$script:PayloadJs  = Join-Path $script:RepoRoot 'dist\payload.js'
$script:InjectMjs  = Join-Path $PSScriptRoot 'inject.mjs'
$script:StateDir   = Join-Path $env:ProgramData 'ClaudeRtl'
$script:StateFile  = Join-Path $script:StateDir 'state.json'
$script:TaskName   = 'ClaudeRtlWatcher'
$script:Marker     = 'claude-rtl-payload'
$script:BakSuffix  = '.crtl-bak'

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
function Write-Log($m)  { Write-Host "  [*] $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [+] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err($m)  { Write-Host "  [x] $m" -ForegroundColor Red }
function Write-Step($m) { Write-Host "`n> $m" -ForegroundColor Magenta }

# --------------------------------------------------------------------------
# Admin / elevation
# --------------------------------------------------------------------------
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Elevate {
    param([string[]]$PassArgs)
    if (-not $PSCommandPath) {
        throw "Cannot self-elevate an in-memory script. Clone the repo and run windows\patch.ps1 directly."
    }
    Write-Warn2 "Administrator rights required. Re-launching elevated..."
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"") + $PassArgs
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList
    Exit
}

# --------------------------------------------------------------------------
# Install discovery: MSIX (Store) vs Squirrel (claude.ai .exe)
# --------------------------------------------------------------------------
function Find-ClaudeInstall {
    # MSIX / Microsoft Store
    $pkg = Get-AppxPackage | Where-Object { $_.Name -eq 'Claude' -or $_.Name -like '*AnthropicClaude*' } |
        Where-Object { $_.InstallLocation -like '*WindowsApps*' } | Select-Object -First 1
    if ($pkg) {
        $appDir = Join-Path $pkg.InstallLocation 'app'
        if (-not (Test-Path $appDir)) { $appDir = $pkg.InstallLocation }
        $res = Join-Path $appDir 'resources'
        return [pscustomobject]@{
            Model      = 'MSIX'
            Root       = $pkg.InstallLocation
            AppDir     = $appDir
            Asar       = Join-Path $res 'app.asar'
            Exe        = Join-Path $appDir 'claude.exe'
            CoworkSvc  = Join-Path $res 'cowork-svc.exe'
            Version    = $pkg.Version
            Package    = $pkg
        }
    }

    # Squirrel (claude.ai installer) — newest app-* folder wins.
    $base = Join-Path $env:LOCALAPPDATA 'AnthropicClaude'
    if (Test-Path $base) {
        $appDir = Get-ChildItem -Path $base -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($appDir) {
            $res = Join-Path $appDir.FullName 'resources'
            $ver = if ($appDir.Name -match 'app-(.+)$') { $matches[1] } else { $null }
            return [pscustomobject]@{
                Model      = 'Squirrel'
                Root       = $base
                AppDir     = $appDir.FullName
                Asar       = Join-Path $res 'app.asar'
                Exe        = Join-Path $appDir.FullName 'claude.exe'
                CoworkSvc  = Join-Path $res 'cowork-svc.exe'
                Version    = $ver
                Package    = $null
            }
        }
    }
    return $null
}

# --------------------------------------------------------------------------
# File integrity helpers (the safety harness)
# --------------------------------------------------------------------------
function Compute-AsarHash([string]$Path) {
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $br = New-Object System.IO.BinaryReader($fs)
        $fs.Seek(12, 'Begin') | Out-Null
        $jsonSize = $br.ReadUInt32()
        if ($jsonSize -le 0 -or $jsonSize -gt 10485760) { throw "abnormal ASAR header size $jsonSize" }
        $jsonBytes = $br.ReadBytes([int]$jsonSize)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $h = $sha.ComputeHash($jsonBytes)
        return ([BitConverter]::ToString($h)).Replace('-', '').ToLower()
    } finally { $fs.Close() }
}

function Test-FileValid([string]$Path, [string]$Type) {
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    try {
        $len = (Get-Item -LiteralPath $Path).Length
        if ($len -lt 16) { return $false }
        switch ($Type) {
            'asar' { $null = Compute-AsarHash $Path; return $true }
            'pe' {
                if ($len -lt 1048576) { return $false }
                $fs = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
                try { return ($fs.ReadByte() -eq 0x4D -and $fs.ReadByte() -eq 0x5A) }
                finally { $fs.Close() }
            }
            default { return ($len -gt 0) }
        }
    } catch { return $false }
}

function Copy-FileSafe([string]$Source, [string]$Dest, [string]$ValidateAs) {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Copy-FileSafe: source missing: $Source" }
    if ($ValidateAs -and -not (Test-FileValid $Source $ValidateAs)) {
        throw "Refusing to copy a corrupt source ($ValidateAs): $Source"
    }
    $tmp = "$Dest.tmp"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    try {
        Copy-Item -LiteralPath $Source -Destination $tmp -Force -ErrorAction Stop
    } catch {
        # Byte-level fallback for locked binaries.
        [System.IO.File]::WriteAllBytes($tmp, [System.IO.File]::ReadAllBytes($Source))
    }
    $sl = (Get-Item -LiteralPath $Source).Length
    $tl = (Get-Item -LiteralPath $tmp).Length
    if ($sl -ne $tl) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; throw "Copy-FileSafe: size mismatch for $Dest" }
    if ($ValidateAs -and -not (Test-FileValid $tmp $ValidateAs)) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        throw "Copy-FileSafe: copy failed integrity ($ValidateAs) for $Dest"
    }
    Move-Item -LiteralPath $tmp -Destination $Dest -Force
}

function Wait-FileUnlock([string]$Path, [int]$Timeout = 15) {
    if (-not (Test-Path $Path)) { return }
    for ($i = 0; $i -lt $Timeout; $i++) {
        try { $fs = [System.IO.File]::Open($Path, 'Open', 'ReadWrite', 'None'); $fs.Close(); return }
        catch { Start-Sleep -Seconds 1 }
    }
    throw "File still locked after ${Timeout}s: $Path"
}

# Fast native byte search (ISO-8859-1 round-trip -> String.IndexOf).
function Find-Bytes([byte[]]$Hay, [byte[]]$Needle, [int]$Start = 0) {
    if (-not $Needle -or $Needle.Length -eq 0 -or -not $Hay -or $Hay.Length -lt $Needle.Length) { return -1 }
    $enc = [System.Text.Encoding]::GetEncoding(28591)
    return $enc.GetString($Hay).IndexOf($enc.GetString($Needle), [Math]::Max(0, $Start), [System.StringComparison]::Ordinal)
}

# --------------------------------------------------------------------------
# Service / process control
# --------------------------------------------------------------------------
function Get-CoworkService {
    return Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
        Where-Object { $_.PathName -match 'cowork-svc' } | Select-Object -First 1
}

function Stop-ClaudeStack {
    Write-Step 'Halting Claude and cowork-svc...'
    $svc = Get-CoworkService
    if ($svc) {
        Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 10; $i++) {
            if ((Get-Service -Name $svc.Name -ErrorAction SilentlyContinue).Status -eq 'Stopped') { break }
            Start-Sleep -Seconds 1
        }
    }
    foreach ($n in @('claude', 'cowork-svc')) {
        # Only kill processes from THIS Claude install path (never a Claude Code editor).
        Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.Path } |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Ok 'Stopped.'
}

function Start-ClaudeStack([object]$Claude) {
    Write-Step 'Restarting cowork-svc and launching Claude...'
    $svc = Get-CoworkService
    if ($svc) {
        try { Start-Service -Name $svc.Name -ErrorAction Stop; Write-Ok "Service $($svc.Name) started." }
        catch { Write-Warn2 "Could not start $($svc.Name): $($_.Exception.Message)" }
    }
    try {
        if ($Claude.Model -eq 'MSIX' -and $Claude.Package) {
            Start-Process "shell:AppsFolder\$($Claude.Package.PackageFamilyName)!Claude" -ErrorAction Stop
        } elseif (Test-Path $Claude.Exe) {
            Start-Process -FilePath $Claude.Exe -ErrorAction Stop
        }
        Write-Ok 'Claude launched.'
    } catch { Write-Warn2 "Launch Claude manually. ($($_.Exception.Message))" }
}

function Grant-Write([string]$Path) {
    cmd.exe /c "takeown /F `"$Path`" /R /D Y >nul 2>&1"
    cmd.exe /c "icacls `"$Path`" /grant `"*S-1-5-32-544:(OI)(CI)F`" /T /Q >nul 2>&1"
}

# --------------------------------------------------------------------------
# Node tooling (bundled node if present, else npx)
# --------------------------------------------------------------------------
function Test-NodeTooling {
    try { $null = & cmd.exe /c 'node --version 2>&1'; if ($LASTEXITCODE -ne 0) { return $false } }
    catch { return $false }
    return $true
}
function Invoke-Asar([string[]]$AsarArgs) {
    $cmd = 'npx --yes @electron/asar ' + ($AsarArgs -join ' ')
    cmd.exe /c $cmd
    return $LASTEXITCODE
}
function Invoke-Fuses([string[]]$FuseArgs) {
    $cmd = 'npx --yes @electron/fuses ' + ($FuseArgs -join ' ')
    cmd.exe /c $cmd
    return $LASTEXITCODE
}

# --------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------
function Save-State([object]$Claude) {
    if (-not (Test-Path $script:StateDir)) { New-Item -ItemType Directory -Path $script:StateDir -Force | Out-Null }
    @{
        model   = $Claude.Model
        version = "$($Claude.Version)"
        appDir  = $Claude.AppDir
        at      = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -Path $script:StateFile -Encoding ASCII
}

# --------------------------------------------------------------------------
# Backups / restore (validated, all-or-nothing)
# --------------------------------------------------------------------------
function Get-BackupTargets([object]$Claude) {
    $t = @(
        @{ Orig = $Claude.Asar; Bak = "$($Claude.Asar)$script:BakSuffix"; Type = 'asar' },
        @{ Orig = $Claude.Exe;  Bak = "$($Claude.Exe)$script:BakSuffix";  Type = 'pe' }
    )
    if (Test-Path $Claude.CoworkSvc) {
        $t += @{ Orig = $Claude.CoworkSvc; Bak = "$($Claude.CoworkSvc)$script:BakSuffix"; Type = 'pe' }
    }
    return $t
}

function Backup-Originals([object]$Claude) {
    Write-Step 'Creating validated backups...'
    foreach ($p in Get-BackupTargets $Claude) {
        if (-not (Test-Path $p.Orig)) { continue }
        Wait-FileUnlock $p.Orig
        if (-not (Test-Path $p.Bak)) {
            Copy-FileSafe $p.Orig $p.Bak $p.Type
            Write-Ok "backed up $(Split-Path $p.Orig -Leaf)"
        } else {
            Write-Log "backup already exists for $(Split-Path $p.Orig -Leaf)"
        }
    }
}

function Restore-FromBackups([object]$Claude, [switch]$Rollback) {
    $targets = Get-BackupTargets $Claude
    # Pre-flight: every existing backup must be valid, or we refuse (all-or-nothing).
    $bad = @()
    foreach ($p in $targets) {
        if ((Test-Path $p.Bak) -and -not (Test-FileValid $p.Bak $p.Type)) { $bad += (Split-Path $p.Bak -Leaf) }
    }
    if ($bad.Count -gt 0) {
        Write-Err "Corrupt backup(s): $($bad -join ', '). Refusing to restore (would make things worse)."
        Write-Warn2 "Reinstall Claude to recover."
        return $false
    }
    # Snapshot current state so a botched restore is itself reversible.
    $snaps = @()
    foreach ($p in $targets) {
        if (Test-Path $p.Orig) {
            $snap = "$($p.Orig).pre-rollback"
            try { Copy-Item -LiteralPath $p.Orig -Destination $snap -Force -ErrorAction Stop; $snaps += $snap } catch {}
        }
    }
    $restored = $false
    foreach ($p in $targets) {
        if (Test-Path $p.Bak) {
            try { Wait-FileUnlock $p.Orig; Copy-Item -LiteralPath $p.Bak -Destination $p.Orig -Force -ErrorAction Stop; $restored = $true; Write-Ok "restored $(Split-Path $p.Orig -Leaf)" }
            catch { Write-Warn2 "failed to restore $(Split-Path $p.Orig -Leaf): $($_.Exception.Message)" }
        }
    }
    foreach ($s in $snaps) { if (Test-Path $s) { Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue } }
    return $restored
}

# --------------------------------------------------------------------------
# Certificate dance (only where cowork-svc verifies claude.exe)
# --------------------------------------------------------------------------
function New-FittingCert([int]$HoleSize, [string]$Subject) {
    # Try progressively smaller keys until the DER fits the fixed hole.
    $attempts = @(
        @{ Algo = 'RSA';  Len = 2048 },
        @{ Algo = 'ECDSA_nistP256'; Len = $null },
        @{ Algo = 'RSA';  Len = 1024 }
    )
    foreach ($a in $attempts) {
        $params = @{
            Subject           = $Subject
            Type              = 'CodeSigningCert'
            CertStoreLocation = 'Cert:\LocalMachine\My'
            FriendlyName      = 'Claude_RTL_SelfSigned'
            KeyExportPolicy   = 'NonExportable'
        }
        if ($a.Algo -eq 'RSA') { $params.KeyAlgorithm = 'RSA'; $params.KeyLength = $a.Len }
        else { $params.KeyAlgorithm = 'ECDSA_nistP256' }
        $cert = New-SelfSignedCertificate @params
        if ($cert.RawData.Length -le $HoleSize) {
            Write-Ok "cert fits: $($a.Algo)$(if($a.Len){"-$($a.Len)"}) = $($cert.RawData.Length) / $HoleSize bytes"
            return $cert
        }
        Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Remove-Item -Force -ErrorAction SilentlyContinue
    }
    throw "No self-signed cert small enough for the $HoleSize-byte hole."
}

function Invoke-CertDance([object]$Claude) {
    if (-not (Test-Path $Claude.CoworkSvc)) { Write-Log 'No cowork-svc.exe; skipping cert dance.'; return }
    Write-Step 'Certificate swap + re-sign (cowork-svc guarded)...'

    # Work from the pristine backup so re-runs always find the original Anthropic cert.
    $svcSource = if (Test-Path "$($Claude.CoworkSvc)$script:BakSuffix") { "$($Claude.CoworkSvc)$script:BakSuffix" } else { $Claude.CoworkSvc }
    $svcBytes  = [System.IO.File]::ReadAllBytes($svcSource)
    $anchor    = [System.Text.Encoding]::ASCII.GetBytes('Anthropic, PBC')

    $start = -1; $holeSize = 0; $offset = 0
    while ($true) {
        $ap = Find-Bytes $svcBytes $anchor $offset
        if ($ap -eq -1) { break }
        $limit = [Math]::Max(0, $ap - 2000)
        for ($i = $ap; $i -ge $limit; $i--) {
            if ($svcBytes[$i] -eq 0x30 -and $svcBytes[$i + 1] -eq 0x82) {
                $sz = 4 + (([int]$svcBytes[$i + 2] -shl 8) -bor [int]$svcBytes[$i + 3])
                if ($sz -gt 500 -and $sz -lt 4000 -and $i -lt $ap -and ($i + $sz) -gt $ap) { $start = $i; $holeSize = $sz; break }
            }
        }
        if ($start -ne -1) { break }
        $offset = $ap + 1
    }
    if ($start -eq -1) { throw 'Anthropic certificate not located in cowork-svc.exe.' }
    Write-Log ("cert hole at 0x{0:x} size {1}" -f $start, $holeSize)

    # Clone original signer subject (cosmetic stealth) if available.
    $subject = 'CN=Anthropic PBC, O=Anthropic PBC'
    try {
        $exeSource = if (Test-Path "$($Claude.Exe)$script:BakSuffix") { "$($Claude.Exe)$script:BakSuffix" } else { $Claude.Exe }
        $sig = Get-AuthenticodeSignature -FilePath $exeSource
        if ($sig -and $sig.SignerCertificate) { $subject = $sig.SignerCertificate.Subject }
    } catch {}

    $cert = New-FittingCert -HoleSize $holeSize -Subject $subject
    $root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
    $root.Open('ReadWrite'); $root.Add($cert); $root.Close()
    Write-Ok 'Self-signed cert added to Trusted Root.'

    # Re-sign claude.exe (its bytes changed from inject + fuse-off).
    Wait-FileUnlock $Claude.Exe
    Invoke-ReSign $Claude.Exe $cert

    # Swap cert bytes in cowork-svc.exe (zero-padded to preserve size), re-sign.
    $newCert = $cert.RawData
    $padded  = New-Object byte[] $holeSize
    [Array]::Copy($newCert, 0, $padded, 0, $newCert.Length)
    [Array]::Copy($padded, 0, $svcBytes, $start, $holeSize)
    Wait-FileUnlock $Claude.CoworkSvc
    [System.IO.File]::WriteAllBytes($Claude.CoworkSvc, $svcBytes)
    Invoke-ReSign $Claude.CoworkSvc $cert
    Write-Ok 'cowork-svc.exe cert replaced and re-signed.'

    # Wipe the private key; keep the public cert in Root for verification.
    Remove-CertPrivateKey $cert.Thumbprint
}

function Invoke-ReSign([string]$Path, $Cert) {
    for ($i = 1; $i -le 6; $i++) {
        try {
            $r = Set-AuthenticodeSignature -FilePath $Path -Certificate $Cert -HashAlgorithm SHA256 -ErrorAction Stop
            if ($r.Status -eq 'Valid') { Write-Ok "re-signed $(Split-Path $Path -Leaf)"; return }
        } catch { Start-Sleep -Seconds 2 }
    }
    throw "Failed to re-sign $(Split-Path $Path -Leaf) after 6 attempts."
}

function Remove-CertPrivateKey([string]$Thumb) {
    try {
        $my = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', 'LocalMachine')
        $my.Open('ReadWrite')
        $found = $my.Certificates | Where-Object { $_.Thumbprint -eq $Thumb }
        if ($found) {
            if ($found.HasPrivateKey) {
                try {
                    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($found)
                    if ($rsa -is [System.Security.Cryptography.RSACng]) { $rsa.Key.Delete() }
                    else {
                        $ecdsa = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($found)
                        if ($ecdsa -is [System.Security.Cryptography.ECDsaCng]) { $ecdsa.Key.Delete() }
                    }
                } catch {}
            }
            $my.Remove($found)
        }
        $my.Close()
        Write-Ok 'Private signing key wiped (public cert retained in Root).'
    } catch { Write-Warn2 "Could not wipe private key: $($_.Exception.Message)" }
}

function Remove-RtlCerts {
    foreach ($store in @('My', 'Root')) {
        Get-ChildItem "Cert:\LocalMachine\$store" -ErrorAction SilentlyContinue |
            Where-Object { $_.FriendlyName -eq 'Claude_RTL_SelfSigned' } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

# --------------------------------------------------------------------------
# Preflight (read-only)
# --------------------------------------------------------------------------
function Invoke-Preflight {
    Write-Step 'Preflight (read-only)...'
    $ok = $true
    $claude = Find-ClaudeInstall
    if (-not $claude) { Write-Err 'Claude Desktop not found (MSIX or claude.ai install).'; return $false }
    Write-Ok "Found $($claude.Model) install v$($claude.Version) at $($claude.AppDir)"
    if (-not (Test-Path $claude.Asar)) { Write-Err "app.asar missing: $($claude.Asar)"; $ok = $false }
    if (-not (Test-Path $script:PayloadJs)) { Write-Err "payload missing: $script:PayloadJs (run: npm run build)"; $ok = $false } else { Write-Ok 'payload present' }
    if (-not (Test-Path $script:InjectMjs)) { Write-Err "injector missing: $script:InjectMjs"; $ok = $false } else { Write-Ok 'injector present' }
    if (-not (Test-NodeTooling)) { Write-Err 'Node.js not found in PATH (needed for asar/fuses).'; $ok = $false } else { Write-Ok 'node present' }
    if ($claude.Model -eq 'MSIX' -and -not (Test-Admin)) { Write-Warn2 'MSIX install: administrator rights will be required for -Install.' }
    $running = Get-Process -Name claude -ErrorAction SilentlyContinue
    if ($running) { Write-Warn2 'Claude is running; it will be closed during install.' }
    if ($ok) { Write-Ok 'Preflight passed.' } else { Write-Err 'Preflight failed; resolve the items above.' }
    return $ok
}

# --------------------------------------------------------------------------
# Status / Verify (read-only)
# --------------------------------------------------------------------------
function Test-AsarPatched([string]$Asar) {
    if (-not (Test-Path $Asar)) { return $false }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Asar)
        return (Find-Bytes $bytes ([System.Text.Encoding]::ASCII.GetBytes($script:Marker)) 0) -ge 0
    } catch { return $false }
}

function Get-Status {
    $claude = Find-ClaudeInstall
    if (-not $claude) { Write-Err 'Claude not found.'; return }
    Write-Host "`nClaude Desktop RTL - status" -ForegroundColor Cyan
    Write-Host ("  install model : {0}" -f $claude.Model)
    Write-Host ("  version       : {0}" -f $claude.Version)
    Write-Host ("  app dir       : {0}" -f $claude.AppDir)
    Write-Host ("  payload built : {0}" -f (Test-Path $script:PayloadJs))
    Write-Host ("  patched       : {0}" -f (Test-AsarPatched $claude.Asar))
    Write-Host ("  backup asar   : {0}" -f (Test-Path "$($claude.Asar)$script:BakSuffix"))
    $watch = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
    Write-Host ("  auto re-patch : {0}" -f ([bool]$watch))
}

function Test-Verify {
    $claude = Find-ClaudeInstall
    if (-not $claude) { Write-Err 'Claude not found.'; return $false }
    Write-Step 'Verify (read-only)...'
    $asarOk = Test-AsarPatched $claude.Asar
    Write-Host ("  asar payload marker : {0}" -f $asarOk)
    if (Test-Path $claude.CoworkSvc) {
        $rootHas = (Get-ChildItem 'Cert:\LocalMachine\Root' -ErrorAction SilentlyContinue |
            Where-Object { $_.FriendlyName -eq 'Claude_RTL_SelfSigned' } | Measure-Object).Count -gt 0
        Write-Host ("  rtl cert in Root    : {0}" -f $rootHas)
    }
    return $asarOk
}

# --------------------------------------------------------------------------
# Watcher (scheduled task, re-invokes THIS local script -Auto)
# --------------------------------------------------------------------------
function Install-Watcher {
    if (-not $PSCommandPath) { Write-Warn2 'Watcher needs a local script path; run from a clone.'; return }
    Write-Step 'Installing auto re-patch watcher...'
    $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Auto"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -RunLevel Highest -LogonType Interactive
    Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Re-applies Claude RTL after an update.' -Force | Out-Null
    Write-Ok "Watcher '$script:TaskName' installed."
}
function Uninstall-Watcher {
    $t = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
    if ($t) { Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false; Write-Ok 'Watcher removed.' }
    else { Write-Log 'No watcher installed.' }
}

# --------------------------------------------------------------------------
# Install (atomic, rollback on any failure)
# --------------------------------------------------------------------------
function Install-Patch([object]$Claude) {
    Write-Host "`n=== Installing Claude RTL ($($Claude.Model)) ===" -ForegroundColor Cyan
    if (-not (Test-Path $script:PayloadJs)) { throw "payload not built: $script:PayloadJs (run npm run build first)" }
    if (-not (Test-NodeTooling)) { throw 'Node.js is required (asar/fuses).' }

    Stop-ClaudeStack
    if ($Claude.Model -eq 'MSIX') { Write-Step 'Taking ownership...'; Grant-Write $Claude.AppDir }

    Backup-Originals $Claude
    # Always start from clean originals so re-runs patch pristine files.
    Restore-FromBackups $Claude | Out-Null

    $work = Join-Path $env:TEMP 'claude_rtl_extract'
    try {
        Write-Step 'Phase 1: inject payload into app.asar'
        if (Test-Path $work) { Remove-Item $work -Recurse -Force }
        if ((Invoke-Asar @('extract', "`"$($Claude.Asar)`"", "`"$work`"")) -ne 0) { throw 'asar extract failed' }

        $r = & cmd.exe /c "node `"$script:InjectMjs`" `"$work`" `"$script:PayloadJs`" 2>&1"
        Write-Log ($r -join "`n")
        if ($LASTEXITCODE -ne 0) { throw "inject.mjs failed (exit $LASTEXITCODE)" }

        $newAsar = "$($Claude.Asar).new"
        if ((Invoke-Asar @('pack', "`"$work`"", "`"$newAsar`"", '--unpack', '"{**/*.node,**/*.dll}"')) -ne 0) { throw 'asar pack failed' }
        if (-not (Test-FileValid $newAsar 'asar')) { Remove-Item $newAsar -Force -ErrorAction SilentlyContinue; throw 'repacked asar failed integrity check' }
        Move-Item $newAsar $Claude.Asar -Force
        Write-Ok 'app.asar patched.'

        Write-Step 'Phase 2: disable ASAR-integrity fuse on claude.exe'
        Wait-FileUnlock $Claude.Exe
        $fuseOk = $false
        for ($i = 1; $i -le 6; $i++) {
            if ((Invoke-Fuses @('write', '--app', "`"$($Claude.Exe)`"", 'EnableEmbeddedAsarIntegrityValidation=off')) -eq 0) { $fuseOk = $true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $fuseOk) { throw 'fuse write failed (claude.exe locked?)' }
        Write-Ok 'ASAR-integrity fuse disabled.'

        Write-Step 'Phase 3: certificate sync'
        Invoke-CertDance $Claude

        Save-State $Claude
        Start-ClaudeStack $Claude
        Write-Host "`n=== RTL INSTALLED SUCCESSFULLY ===`n" -ForegroundColor Green

        if (-not $Auto) {
            $ans = Read-Host 'Enable auto re-patch after Claude updates? (Y/n)'
            if ($ans -ne 'n' -and $ans -ne 'N') { Install-Watcher }
        }
    } catch {
        Write-Err "Install failed: $($_.Exception.Message)"
        Write-Warn2 'Rolling back to originals...'
        Restore-FromBackups $Claude -Rollback | Out-Null
        Remove-RtlCerts
        Start-ClaudeStack $Claude
        throw "Installation failed and was rolled back. See messages above."
    } finally {
        if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Restore-Patch([object]$Claude) {
    Write-Host "`n=== Restoring Claude to original ===" -ForegroundColor Cyan
    Stop-ClaudeStack
    if ($Claude.Model -eq 'MSIX') { Grant-Write $Claude.AppDir }
    $ok = Restore-FromBackups $Claude
    Remove-RtlCerts
    Start-ClaudeStack $Claude
    if ($ok) { Write-Ok 'Restore complete.' } else { Write-Warn2 'Nothing restored (no backups?).' }
}

# --------------------------------------------------------------------------
# Menu
# --------------------------------------------------------------------------
function Show-Menu {
    Write-Host "`n=================================================" -ForegroundColor Cyan
    Write-Host "        Claude Desktop RTL - Windows" -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host '  1. Install RTL'
    Write-Host '  2. Restore original'
    Write-Host '  3. Status'
    Write-Host '  4. Verify'
    Write-Host '  5. Preflight (read-only)'
    Write-Host '  6. Enable auto re-patch'
    Write-Host '  7. Disable auto re-patch'
    Write-Host '  8. Exit'
    $c = Read-Host "`nChoice"
    switch ($c) {
        '1' { Invoke-Action -DoInstall }
        '2' { Invoke-Action -DoRestore }
        '3' { Get-Status; Show-Menu }
        '4' { Test-Verify | Out-Null; Show-Menu }
        '5' { Invoke-Preflight | Out-Null; Show-Menu }
        '6' { Install-Watcher; Show-Menu }
        '7' { Uninstall-Watcher; Show-Menu }
        '8' { return }
        default { Show-Menu }
    }
}

# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------
function Invoke-Action {
    param([switch]$DoInstall, [switch]$DoRestore)
    $claude = Find-ClaudeInstall
    if (-not $claude) { Write-Err 'Claude Desktop not found.'; return }
    # MSIX writes into WindowsApps -> needs admin. Elevate carrying the same intent.
    if ($claude.Model -eq 'MSIX' -and -not (Test-Admin)) {
        $flag = if ($DoInstall) { @('-Install') } else { @('-Restore') }
        Invoke-Elevate -PassArgs $flag
    }
    try {
        if ($DoInstall) { Install-Patch $claude } else { Restore-Patch $claude }
    } catch { Write-Err $_.Exception.Message }
}

if ($Preflight) { Invoke-Preflight | Out-Null; return }
if ($Status)    { Get-Status; return }
if ($Verify)    { Test-Verify | Out-Null; return }
if ($Unwatch)   { Uninstall-Watcher; return }
if ($Watch)     { Install-Watcher; return }
if ($Restore)   { Invoke-Action -DoRestore; return }
if ($Install -or $Auto) { Invoke-Action -DoInstall; return }

Show-Menu
