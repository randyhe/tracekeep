[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

function Get-FullPath([string]$Path) {
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function New-TracekeepTokenFile([string]$Path) {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $token = [Convert]::ToBase64String($bytes)
    $plain = [System.Text.Encoding]::UTF8.GetBytes($token)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        $plain,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [System.IO.File]::WriteAllBytes($Path, $protected)
}

$root = Get-FullPath $ReleaseRoot
$pluginSource = Join-Path $root "plugin\tracekeep"
$workPath = Join-Path $root "work"
$marketplaceRoot = Join-Path $workPath "marketplace"
$pluginDestination = Join-Path $marketplaceRoot "plugins\tracekeep"
$marketplacePath = Join-Path $marketplaceRoot ".agents\plugins\marketplace.json"
$tokenPath = Join-Path $workPath "auth-token.dpapi"
$nodePath = Join-Path $root "bundled-node\node.exe"

foreach ($required in @($pluginSource, $nodePath, (Join-Path $root "scripts\Start-Tracekeep.ps1"))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "The release is incomplete. Missing: $required" }
}

New-Item -ItemType Directory -Path $workPath -Force | Out-Null
if (-not (Test-Path -LiteralPath $tokenPath)) { New-TracekeepTokenFile $tokenPath }

if (Test-Path -LiteralPath $pluginDestination) {
    $backup = "$pluginDestination.backup-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
    Move-Item -LiteralPath $pluginDestination -Destination $backup
    Write-Host "Previous Tracekeep plugin backed up to: $backup"
}
New-Item -ItemType Directory -Path $pluginDestination -Force | Out-Null
Get-ChildItem -LiteralPath $pluginSource -Force | Copy-Item -Destination $pluginDestination -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $pluginDestination "runtime") -Force | Out-Null
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $pluginDestination "runtime\node.exe") -Force
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $pluginDestination "release-root.txt"), $root, $utf8NoBom)

# Codex starts stdio MCP servers from the active task directory unless an
# explicit working directory is provided. Resolve it at install time so the
# packaged plugin remains portable while its relative script path is reliable.
$mcpPath = Join-Path $pluginDestination ".mcp.json"
$mcpConfig = [System.IO.File]::ReadAllText($mcpPath) | ConvertFrom-Json
$mcpServer = $mcpConfig.mcpServers.'tracekeep-memory-local'
if ($null -eq $mcpServer) { throw "Tracekeep MCP configuration is missing tracekeep-memory-local." }
$mcpServer | Add-Member -NotePropertyName "cwd" -NotePropertyValue $pluginDestination -Force
$mcpJson = $mcpConfig | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($mcpPath, $mcpJson, $utf8NoBom)

New-Item -ItemType Directory -Path (Split-Path -Parent $marketplacePath) -Force | Out-Null
$marketplace = [ordered]@{
    name = "tracekeep-release"
    interface = [ordered]@{ displayName = "Tracekeep Local Release" }
    plugins = @([ordered]@{
        name = "tracekeep"
        source = [ordered]@{ source = "local"; path = "./plugins/tracekeep" }
        policy = [ordered]@{ installation = "AVAILABLE"; authentication = "ON_INSTALL" }
        category = "Productivity"
    })
}
$marketplaceJson = $marketplace | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($marketplacePath, $marketplaceJson, $utf8NoBom)

$codex = (Get-Command codex.exe -ErrorAction Stop).Source
$codexCopy = Join-Path $workPath "codex-plugin-installer.exe"
Copy-Item -LiteralPath $codex -Destination $codexCopy -Force
& $codexCopy plugin marketplace add $marketplaceRoot
if ($LASTEXITCODE -ne 0) { throw "Codex could not register the local Tracekeep marketplace." }
& $codexCopy plugin add tracekeep@tracekeep-release
if ($LASTEXITCODE -ne 0) { throw "Codex could not install tracekeep@tracekeep-release." }

& (Join-Path $root "scripts\Start-Tracekeep.ps1") -ReleaseRoot $root -NoBrowser:$NoBrowser
if ($LASTEXITCODE -ne 0) { throw "Tracekeep was installed but could not be started." }

Write-Host "Tracekeep plugin: $pluginDestination"
Write-Host "Tracekeep marketplace: $marketplacePath"
Write-Host "Tracekeep data: $(Join-Path $workPath 'data')"
