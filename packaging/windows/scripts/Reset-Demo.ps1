[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot
)

$ErrorActionPreference = "Stop"

function Get-FullPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

$root = Get-FullPath $ReleaseRoot
$workPath = Get-FullPath (Join-Path $root "work")
$dataPath = Get-FullPath (Join-Path $workPath "demo-data")
$expectedDataPath = Get-FullPath (Join-Path (Join-Path $root "work") "demo-data")
$seedPath = Get-FullPath (Join-Path $root "demo-seed")
$pidPath = Join-Path $workPath "tracekeep.pid"

if (-not [string]::Equals($dataPath, $expectedDataPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Reset refused: the demo data path did not match the expected absolute path."
}

$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
if (-not $dataPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Reset refused: the demo data path is outside the extracted release."
}

if ([string]::Equals($dataPath, [System.IO.Path]::GetPathRoot($dataPath).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Reset refused: a drive root can never be a demo data directory."
}

$officialDataPath = if ($env:LOCALAPPDATA) { Get-FullPath (Join-Path $env:LOCALAPPDATA "Tracekeep") } else { $null }
if ($officialDataPath -and [string]::Equals($dataPath, $officialDataPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Reset refused: the demo path must never be the official Tracekeep data directory."
}

if (Test-Path -LiteralPath $pidPath) {
    $processId = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
        throw "Tracekeep is still running as process $processId. Close it before resetting the demo."
    }
    Remove-Item -LiteralPath $pidPath -Force
}

if (Test-Path -LiteralPath $dataPath) {
    Remove-Item -LiteralPath $dataPath -Recurse -Force
}
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
if (Test-Path -LiteralPath $seedPath) {
    Get-ChildItem -LiteralPath $seedPath -Force | Copy-Item -Destination $dataPath -Recurse -Force
}

Write-Host "Reset completed for the isolated demo directory: $dataPath"
