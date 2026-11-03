# Update smoke for the Windows build, run by .github/workflows/smoke-update.yml.
#
#   refuse  Sign the build's own complete MAR with a throwaway key and offer it
#           as an update. The build only trusts the keys under
#           overlay/toolkit/mozapps/update/updater, so the updater must reject
#           it, and the installed version must not change.
#   apply   Offer a MAR signed with the real release key (-SignedMar). The
#           updater must accept it and the install must change to its version.
#
# The update URL is compiled into application.ini and there is no pref for it,
# so the smoke points the installed browser at a loopback server through the
# AppUpdateURL enterprise policy in the install's distribution/policies.json.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('refuse', 'apply')][string]$Mode,
    [Parameter(Mandatory)][string]$InstallerDir,
    [string]$SignedMar = '',
    [int]$TimeoutSeconds = 420,
    [int]$Port = 8123
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$work = Join-Path $env:RUNNER_TEMP "update-$Mode"
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Read-Ini([string]$Path, [string]$Key) {
    $line = Get-Content $Path | Where-Object { $_ -like "$Key=*" } | Select-Object -First 1
    if (-not $line) { throw "$Key not found in $Path" }
    return $line.Substring($Key.Length + 1).Trim()
}

function Invoke-Python {
    & python @args
    if ($LASTEXITCODE -ne 0) { throw "python $args exited with $LASTEXITCODE" }
}

# --- Install the build under test ------------------------------------------
$installer = @(Get-ChildItem (Join-Path $InstallerDir 'kyberfox-*.installer.exe'))
if ($installer.Count -ne 1) { throw "Expected one installer, found $($installer.Count)" }
$p = Start-Process -FilePath $installer[0].FullName -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Installer exited with $($p.ExitCode)" }
$dir = Join-Path $env:LOCALAPPDATA 'Kyber Fox'
$exe = Join-Path $dir 'kyberfox.exe'
if (-not (Test-Path $exe)) { throw "$exe not found" }
$ini = Join-Path $dir 'application.ini'
$oldVersion = Read-Ini $ini 'Version'
$oldBuildId = Read-Ini $ini 'BuildID'
Write-Host "Installed Firefox version $oldVersion, build $oldBuildId"
Write-Host "application.ini update URL: $(Read-Ini $ini 'URL')"
$oldDisplay = (& $exe --version --wait-for-browser | Out-String).Trim()
Write-Host "kyberfox.exe --version: $oldDisplay"

# --- Tools -------------------------------------------------------------------
Invoke-Python -m pip install --quiet --require-hashes -r (Join-Path $repo 'requirements-release.txt')

# --- The MAR to offer --------------------------------------------------------
$serve = Join-Path $work 'serve'
New-Item -ItemType Directory -Force -Path $serve | Out-Null
$offered = Join-Path $serve 'kyberfox.complete.mar'
Push-Location $repo
try {
    if ($Mode -eq 'refuse') {
        $unsigned = @(Get-ChildItem (Join-Path $InstallerDir 'kyberfox-*.complete.mar'))
        if ($unsigned.Count -ne 1) { throw "Expected one complete MAR, found $($unsigned.Count)" }
        $key = Join-Path $work 'throwaway.pem'
        $genKey = @'
import sys
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
open(sys.argv[1], 'wb').write(key.private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
    serialization.NoEncryption()))
'@
        $genKey | python -I - $key
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate the throwaway key' }
        Invoke-Python -m tools.sign_mar sign --key $key --in $unsigned[0].FullName --out $offered
        # The throwaway signature must not verify against the keys the build trusts.
        foreach ($name in 'release_primary', 'release_secondary') {
            $cert = "overlay/toolkit/mozapps/update/updater/$name.der"
            & python -m tools.sign_mar verify --cert $cert $offered
            if ($LASTEXITCODE -eq 0) { throw "Throwaway signature verifies against $cert" }
        }
    } else {
        if (-not $SignedMar -or -not (Test-Path $SignedMar)) { throw '-SignedMar is required for apply' }
        Copy-Item $SignedMar $offered
        Invoke-Python -m tools.sign_mar verify --cert overlay/toolkit/mozapps/update/updater/release_primary.der $offered
    }

    # Version and build ID the manifest advertises: from the MAR itself for
    # apply; far ahead of the install for refuse.
    if ($Mode -eq 'apply') {
        $extract = Join-Path $work 'extract'
        New-Item -ItemType Directory -Force -Path $extract | Out-Null
        Push-Location $extract
        try {
            & python -c "import sys; from mardor.cli import main; main(sys.argv[1:])" --auto -x $offered
            if ($LASTEXITCODE -ne 0) { throw 'mar -x failed' }
        } finally { Pop-Location }
        $newIni = Join-Path $extract 'application.ini'
        $newVersion = Read-Ini $newIni 'Version'
        $newBuildId = Read-Ini $newIni 'BuildID'
    } else {
        $newVersion = '999.0'
        $newBuildId = '29990101000000'
    }
    Invoke-Python -m tools.update_manifest --version $newVersion --display-version $newVersion `
        --build-id $newBuildId --mar $offered --url "http://127.0.0.1:$Port/kyberfox.complete.mar" `
        --out (Join-Path $serve 'update.xml')
} finally {
    Pop-Location
}
Get-Content (Join-Path $serve 'update.xml')

# --- Loopback server and policy ----------------------------------------------
$serverLog = Join-Path $work 'server.log'
$serverErr = Join-Path $work 'server.err'
$server = Start-Process python -ArgumentList @('-I', (Join-Path $repo 'tools/serve_update.py'), '--dir', $serve, '--port', $Port) `
    -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr -PassThru -NoNewWindow

$policyFile = Join-Path $dir 'distribution\policies.json'
if (Test-Path $policyFile) {
    $policy = Get-Content $policyFile -Raw | ConvertFrom-Json
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path $policyFile) | Out-Null
    $policy = [pscustomobject]@{ policies = [pscustomobject]@{} }
}
$policy.policies | Add-Member -NotePropertyName AppUpdateURL `
    -NotePropertyValue "http://127.0.0.1:$Port/%CHANNEL%/%BUILD_TARGET%/update.xml" -Force
$policy | ConvertTo-Json -Depth 20 | Set-Content $policyFile -Encoding utf8

$kyberProfile = Join-Path $work 'profile'
New-Item -ItemType Directory -Force -Path $kyberProfile | Out-Null
@'
user_pref("app.update.log", true);
user_pref("app.update.log.file", true);
user_pref("app.update.timerFirstInterval", 10000);
user_pref("app.update.interval", 3600);
'@ | Set-Content (Join-Path $kyberProfile 'user.js') -Encoding ascii

function Get-UpdateFiles {
    $names = 'update.status', 'last-update.log', 'backup-update.log', 'update.log',
        'active-update.xml', 'updates.xml', 'app-update.log'
    $roots = @($dir, $env:LOCALAPPDATA, $env:ProgramData, $env:APPDATA, $kyberProfile)
    foreach ($root in $roots) {
        Get-ChildItem $root -Directory -Recurse -Depth 4 -Force -Filter 'updates' -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ChildItem $_.FullName -File -Recurse -Force -ErrorAction SilentlyContinue }
        Get-ChildItem $root -File -Force -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.Name }
    }
}

# --- Run the browser until the updater reaches a verdict ---------------------
$stdout = Join-Path $work 'browser.out'
$stderr = Join-Path $work 'browser.err'
$arguments = "--headless --no-remote -attach-console --profile `"$kyberProfile`" about:blank"
$browser = Start-Process -FilePath $exe -ArgumentList $arguments -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr -PassThru -NoNewWindow
$verdict = ''
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline -and -not $verdict) {
    Start-Sleep -Seconds 10
    $files = @(Get-UpdateFiles)
    foreach ($f in $files) {
        $text = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $text) { continue }
        if ($f.Name -eq 'update.status' -and $text -match '^(failed: ?\d+|succeeded|applied|pending)') { $verdict = $Matches[1] }
        if ($f.Name -in 'active-update.xml', 'updates.xml' -and $text -match 'state="(failed|succeeded)"') { $verdict = "state $($Matches[1])" }
    }
    Write-Host "$(Get-Date -Format T) verdict '$verdict', $($files.Count) update files, server log $((Get-Item $serverLog).Length) bytes"
    if ($browser.HasExited -and -not $verdict) { Write-Host "Browser exited with $($browser.ExitCode)"; break }
}
Start-Sleep -Seconds 5

# --- Evidence ------------------------------------------------------------------
Write-Host '=== server log'
Get-Content $serverLog
Write-Host '=== update state directories'
Get-ChildItem $env:ProgramData -Directory -Filter 'Mozilla-*' -ErrorAction SilentlyContinue | ForEach-Object {
    Get-ChildItem (Join-Path $_.FullName 'updates') -Recurse -Force -ErrorAction SilentlyContinue |
        ForEach-Object { "$($_.FullName) $($_.Length)" }
}
Write-Host '=== update files'
foreach ($f in @(Get-UpdateFiles | Sort-Object FullName -Unique)) {
    Write-Host "--- $($f.FullName) ($($f.Length) bytes)"
    if ($f.Length -lt 200000 -and $f.Extension -notin '.mar', '.lock') { Get-Content $f.FullName -TotalCount 300 -ErrorAction SilentlyContinue }
}
Write-Host '=== browser output (update lines)'
Get-Content $stdout, $stderr -ErrorAction SilentlyContinue | Select-String -Pattern 'AUS:|update' | Select-Object -First 200

Get-Process -Name kyberfox -ErrorAction SilentlyContinue | Stop-Process -Force
if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
Start-Sleep -Seconds 3

$requests = @(Get-Content $serverLog | Where-Object { $_ -like 'REQUEST *' })
$sawManifest = [bool]($requests | Where-Object { $_ -like 'REQUEST /*update.xml*' })
$sawMar = [bool]($requests | Where-Object { $_ -like 'REQUEST /kyberfox.complete.mar*' })
$manifestPath = ($requests | Where-Object { $_ -like 'REQUEST /*update.xml*' } | Select-Object -First 1)
Write-Host "Manifest request: $manifestPath"
if (-not $sawManifest) { throw 'The updater never requested update.xml' }
# The path the updater expands must match where the manifests are published
# (docs/update-signing.md).
if ($manifestPath -notlike 'REQUEST /release/WINNT_x86_64-msvc-x64/update.xml*') { throw "Unexpected manifest path: $manifestPath" }
if (-not $sawMar) { throw 'The updater never downloaded the MAR' }
$allText = (Get-UpdateFiles | ForEach-Object { Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue }) -join "`n"

if ($Mode -eq 'apply') {
    # Staging is on, so a good MAR is only staged ('applied') and is swapped in
    # at the next browser start; --version exits before that. Start the browser
    # once more with the same profile and wait for the swap.
    $status = @(Get-UpdateFiles | Where-Object { $_.Name -eq 'update.status' } | ForEach-Object { (Get-Content $_.FullName -Raw).Trim() })
    Write-Host "update.status before the restart: $($status -join ', ')"
    $restartDir = Join-Path $work 'restart'
    New-Item -ItemType Directory -Force -Path $restartDir | Out-Null
    $restart = Start-Process -FilePath $exe -ArgumentList "--headless --no-remote --profile `"$kyberProfile`" --screenshot about:blank" `
        -WorkingDirectory $restartDir -NoNewWindow -PassThru
    $swapDeadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $swapDeadline) {
        Start-Sleep -Seconds 5
        $status = @(Get-UpdateFiles | Where-Object { $_.Name -eq 'update.status' } | ForEach-Object { (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue).Trim() })
        if ((Read-Ini $ini 'BuildID') -ne $oldBuildId -or $status -contains 'succeeded') { break }
    }
    Get-Process -Name kyberfox, updater -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 3
    Write-Host "update.status after the restart: $($status -join ', ')"
    Get-UpdateFiles | Where-Object { $_.Name -eq 'last-update.log' } | ForEach-Object { Get-Content $_.FullName -TotalCount 300 -ErrorAction SilentlyContinue }
}

$newBuild = Read-Ini $ini 'BuildID'
$newDisplay = (& $exe --version --wait-for-browser | Out-String).Trim()
Write-Host "kyberfox.exe --version after: $newDisplay"
if ($Mode -eq 'refuse') {
    # CERT_VERIFY_ERROR is 19 in toolkit/mozapps/update/common/updatererrors.h.
    if ($allText -notmatch 'failed: ?19|errorCode="19"|CERT_VERIFY|Could not verify') {
        throw 'No signature failure (error 19) in the update files'
    }
    if ($newBuild -ne $oldBuildId -or $newDisplay -ne $oldDisplay) { throw 'The install changed although the MAR was wrongly signed' }
    # The browser must still start.
    $shot = Join-Path $work 'shot'
    New-Item -ItemType Directory -Force -Path $shot | Out-Null
    $profile2 = Join-Path $work 'profile2'
    New-Item -ItemType Directory -Force -Path $profile2 | Out-Null
    $p2 = Start-Process -FilePath $exe -ArgumentList "--headless --no-remote --profile `"$profile2`" --screenshot about:blank" `
        -WorkingDirectory $shot -NoNewWindow -PassThru
    if (-not $p2.WaitForExit(300000)) { Stop-Process -Id $p2.Id -Force; throw 'Browser did not exit after the refused update' }
    if (-not (Test-Path (Join-Path $shot 'screenshot.png'))) { throw 'No screenshot after the refused update' }
    Write-Host 'REFUSED: signature error, version unchanged, browser starts.'
} else {
    if ($newBuild -ne $newBuildId) { throw "Expected build $newBuildId after the update, found $newBuild" }
    Write-Host "APPLIED: $oldBuildId -> $newBuild"
}
