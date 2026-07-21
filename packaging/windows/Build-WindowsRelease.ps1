[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$env:CI = "true"
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $PSScriptRoot "out"
}
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$stage = Join-Path $outputRoot "Tracekeep-Windows-x64"
$zipPath = "$stage.zip"
$hashPath = "$zipPath.sha256"
$corepackPath = (Get-Command corepack.cmd -ErrorAction Stop).Source

if (-not $outputRoot.StartsWith([System.IO.Path]::GetFullPath($PSScriptRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must remain inside packaging/windows."
}

if (-not $SkipBuild) {
    & $corepackPath pnpm --dir $repositoryRoot install --frozen-lockfile --prod=false
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
    & $corepackPath pnpm --dir $repositoryRoot build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed." }
}

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $hashPath -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stage "app\apps") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "bundled-node") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "scripts") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "demo-seed") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "plugin\tracekeep\mcp-server\dist") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "plugin\tracekeep\scripts") -Force | Out-Null

& $corepackPath pnpm --dir $repositoryRoot --config.node-linker=hoisted --filter @tracekeep/tracekeepd deploy --prod --legacy (Join-Path $stage "app\apps\tracekeepd")
if ($LASTEXITCODE -ne 0) { throw "pnpm deploy failed." }
Copy-Item -LiteralPath (Join-Path $repositoryRoot "apps\web\dist") -Destination (Join-Path $stage "app\apps\web\dist") -Recurse -Force

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $stage "bundled-node\node.exe")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Start Tracekeep.cmd") -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Install Tracekeep.cmd") -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Uninstall Tracekeep.cmd") -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Reset Demo.cmd") -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "scripts\Start-Tracekeep.ps1") -Destination (Join-Path $stage "scripts")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "scripts\Install-Tracekeep.ps1") -Destination (Join-Path $stage "scripts")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "scripts\Uninstall-Tracekeep.ps1") -Destination (Join-Path $stage "scripts")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "scripts\Start-Mcp.ps1") -Destination (Join-Path $stage "plugin\tracekeep\scripts")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "scripts\Reset-Demo.ps1") -Destination (Join-Path $stage "scripts")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README-TESTING.md") -Destination $stage
Copy-Item -LiteralPath (Join-Path $repositoryRoot "LICENSE") -Destination $stage
Copy-Item -LiteralPath (Join-Path $repositoryRoot "THIRD-PARTY-NOTICES.md") -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "demo-seed\README.txt") -Destination (Join-Path $stage "demo-seed")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "demo-seed\demo-data.json") -Destination (Join-Path $stage "demo-seed")
Copy-Item -LiteralPath (Join-Path $repositoryRoot "plugins\tracekeep\.codex-plugin") -Destination (Join-Path $stage "plugin\tracekeep") -Recurse -Force
$pluginAssets = Join-Path $repositoryRoot "plugins\tracekeep\assets"
if (Test-Path -LiteralPath $pluginAssets -PathType Container) {
    Copy-Item -LiteralPath $pluginAssets -Destination (Join-Path $stage "plugin\tracekeep") -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $repositoryRoot "plugins\tracekeep\skills") -Destination (Join-Path $stage "plugin\tracekeep") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "plugins\tracekeep\hooks") -Destination (Join-Path $stage "plugin\tracekeep") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "plugins\tracekeep\mcp-server\dist\index.js") -Destination (Join-Path $stage "plugin\tracekeep\mcp-server\dist\index.js") -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "plugins\tracekeep\mcp-server\package.json") -Destination (Join-Path $stage "plugin\tracekeep\mcp-server\package.json") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "plugin.mcp.json") -Destination (Join-Path $stage "plugin\tracekeep\.mcp.json") -Force

& (Join-Path $PSScriptRoot "scripts\Validate-Release.ps1") -ReleaseDirectory $stage
if ($LASTEXITCODE -ne 0) { throw "Release validation failed." }

Compress-Archive -LiteralPath $stage -DestinationPath $zipPath -CompressionLevel Optimal
$extractedValidationRoot = Join-Path $outputRoot ".validate-extracted-$([System.Guid]::NewGuid().ToString('N'))"
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractedValidationRoot
    $extractedRelease = Join-Path $extractedValidationRoot "Tracekeep-Windows-x64"
    & (Join-Path $PSScriptRoot "scripts\Validate-Release.ps1") -ReleaseDirectory $extractedRelease
    if ($LASTEXITCODE -ne 0) { throw "Extracted ZIP validation failed." }
}
finally {
    Remove-Item -LiteralPath $extractedValidationRoot -Recurse -Force -ErrorAction SilentlyContinue
}
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $hashPath -Value "$hash  $([System.IO.Path]::GetFileName($zipPath))" -Encoding ascii

Write-Host "Release: $zipPath"
Write-Host "SHA-256: $hash"
