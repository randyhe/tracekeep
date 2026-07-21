$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$releaseRootPath = Join-Path $pluginRoot "release-root.txt"
$nodePath = Join-Path $pluginRoot "runtime\node.exe"
$serverPath = Join-Path $pluginRoot "mcp-server\dist\index.js"

foreach ($required in @($releaseRootPath, $nodePath, $serverPath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Tracekeep plugin is incomplete. Missing: $required" }
}

$releaseRoot = [System.IO.Path]::GetFullPath((Get-Content -LiteralPath $releaseRootPath -Raw).Trim())
$tokenPath = Join-Path $releaseRoot "work\auth-token.dpapi"
$portPath = Join-Path $releaseRoot "work\tracekeep-port.txt"
foreach ($required in @($tokenPath, $portPath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Start Tracekeep before using the Codex plugin. Missing: $required" }
}

$protected = [System.IO.File]::ReadAllBytes($tokenPath)
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$env:TRACEKEEP_AUTH_TOKEN = [System.Text.Encoding]::UTF8.GetString($plain)
$port = [int](Get-Content -LiteralPath $portPath -Raw)
if ($port -lt 4310 -or $port -gt 4319) { throw "Tracekeep port configuration is invalid." }
$env:TRACEKEEP_BASE_URL = "http://127.0.0.1:$port"
& $nodePath $serverPath
exit $LASTEXITCODE
