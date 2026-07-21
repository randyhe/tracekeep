[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseDirectory
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$release = [System.IO.Path]::GetFullPath($ReleaseDirectory)
$required = @(
    "Start Tracekeep.cmd",
    "Install Tracekeep.cmd",
    "Uninstall Tracekeep.cmd",
    "Reset Demo.cmd",
    "bundled-node\node.exe",
    "app\apps\tracekeepd\dist\main.js",
    "app\apps\web\dist\index.html",
    "demo-seed",
    "demo-seed\demo-data.json",
    "README-TESTING.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.md",
    "scripts\Start-Tracekeep.ps1",
    "scripts\Install-Tracekeep.ps1",
    "scripts\Uninstall-Tracekeep.ps1",
    "plugin\tracekeep\.codex-plugin\plugin.json",
    "plugin\tracekeep\hooks\hooks.json",
    "plugin\tracekeep\hooks\invoke-stop-capture.ps1",
    "plugin\tracekeep\hooks\stop-capture.mjs",
    "plugin\tracekeep\.mcp.json",
    "plugin\tracekeep\mcp-server\dist\index.js",
    "plugin\tracekeep\scripts\Start-Mcp.ps1",
    "scripts\Reset-Demo.ps1"
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $release $relativePath))) {
        $errors.Add("Missing required release item: $relativePath")
    }
}

$forbiddenPatterns = @("*.db", "*.db-wal", "*.db-shm", "*.sqlite", "*.sqlite3", "*.log", ".env", ".env.*", "AGENTS.md")
foreach ($pattern in $forbiddenPatterns) {
    Get-ChildItem -LiteralPath $release -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        $errors.Add("Forbidden release artifact: $($_.FullName.Substring($release.Length + 1))")
    }
}

$startScript = Join-Path $release "scripts\Start-Tracekeep.ps1"
if (Test-Path -LiteralPath $startScript) {
    $startText = Get-Content -LiteralPath $startScript -Raw
    foreach ($requiredToken in @("127.0.0.1", "4310..4319", "TRACEKEEP_DATA_DIR", "TRACEKEEP_AUTH_TOKEN", "tracekeep-port.txt")) {
        if (-not $startText.Contains($requiredToken)) {
            $errors.Add("Start script is missing required safety token: $requiredToken")
        }
    }
    if ($startText -match "Funnel|0\.0\.0\.0") {
        $errors.Add("Start script contains a forbidden public-network binding or tunnel token.")
    }
}

$resetScript = Join-Path $release "scripts\Reset-Demo.ps1"
if (Test-Path -LiteralPath $resetScript) {
    $resetText = Get-Content -LiteralPath $resetScript -Raw
    foreach ($requiredToken in @("GetFullPath", "expectedDataPath", "official Tracekeep data directory", "Remove-Item -LiteralPath")) {
        if (-not $resetText.Contains($requiredToken)) {
            $errors.Add("Reset script is missing required path guard: $requiredToken")
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    throw "Release validation failed with $($errors.Count) error(s)."
}

$nodeVersion = & (Join-Path $release "bundled-node\node.exe") --version
$workPath = Join-Path $release "work"
$runtimeProcessId = $null
try {
    New-Item -ItemType Directory -Path $workPath -Force | Out-Null
    $tokenBytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($tokenBytes) } finally { $random.Dispose() }
    $token = [Convert]::ToBase64String($tokenBytes)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        [System.Text.Encoding]::UTF8.GetBytes($token),
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [System.IO.File]::WriteAllBytes((Join-Path $workPath "auth-token.dpapi"), $protected)
    $launcher = Join-Path $release "Start Tracekeep.cmd"
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $env:ComSpec
    $startInfo.Arguments = "/d /c `"`"$launcher`" --demo --no-browser`""
    $startInfo.WorkingDirectory = $release
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $launcherProcess = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $launcherProcess.WaitForExit(30000)) {
        $launcherProcess.Kill()
        throw "Start Tracekeep.cmd did not return within 30 seconds."
    }
    if ($launcherProcess.ExitCode -ne 0) { throw "Start Tracekeep.cmd failed with exit code $($launcherProcess.ExitCode)." }
    $runtimeProcessId = [int](Get-Content -LiteralPath (Join-Path $workPath "tracekeep.pid"))
    $listener = Get-NetTCPConnection -OwningProcess $runtimeProcessId -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalAddress -eq "127.0.0.1" -and $_.LocalPort -in 4310..4319 } |
        Select-Object -First 1
    if (-not $listener) { throw "Runtime smoke test did not find the required loopback listener." }
    $health = Invoke-RestMethod "http://127.0.0.1:$($listener.LocalPort)/api/v1/health/ready"
    $loops = Invoke-RestMethod "http://127.0.0.1:$($listener.LocalPort)/api/v1/open-loops" -Headers @{ Authorization = "Bearer $token" }
    if ($health.status -ne "ready" -or $health.schemaVersion -ne 4) { throw "Runtime smoke health or schema check failed." }
    if (@($loops.items).Count -ne 3) { throw "Synthetic demo seed did not create exactly three open loops." }
}
finally {
    if (-not $runtimeProcessId -and (Test-Path -LiteralPath (Join-Path $workPath "tracekeep.pid"))) {
        $runtimeProcessId = [int](Get-Content -LiteralPath (Join-Path $workPath "tracekeep.pid"))
    }
    $runtimeProcess = if ($runtimeProcessId) { Get-Process -Id $runtimeProcessId -ErrorAction SilentlyContinue } else { $null }
    if ($runtimeProcess) {
        Stop-Process -Id $runtimeProcessId -Force
        for ($attempt = 0; $attempt -lt 50 -and (Get-Process -Id $runtimeProcessId -ErrorAction SilentlyContinue); $attempt++) {
            Start-Sleep -Milliseconds 100
        }
    }
    for ($attempt = 0; $attempt -lt 20 -and (Test-Path -LiteralPath $workPath); $attempt++) {
        try { Remove-Item -LiteralPath $workPath -Recurse -Force -ErrorAction Stop }
        catch { Start-Sleep -Milliseconds 100 }
    }
    if (Test-Path -LiteralPath $workPath) { throw "Runtime smoke cleanup could not remove the isolated work directory." }
}

Write-Host "Release validation passed. Bundled Node: $nodeVersion; schema v4; synthetic loops: 3"
