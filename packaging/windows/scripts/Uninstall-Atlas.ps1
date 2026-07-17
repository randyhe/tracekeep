[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($ReleaseRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$workPath = Join-Path $root "work"
$pidPath = Join-Path $workPath "atlas.pid"
$expectedNodePath = [System.IO.Path]::GetFullPath((Join-Path $root "bundled-node\node.exe"))

if (Test-Path -LiteralPath $pidPath) {
    $processId = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    $process = if ($processId) { Get-Process -Id $processId -ErrorAction SilentlyContinue } else { $null }
    if ($process) {
        $actualPath = try { [System.IO.Path]::GetFullPath($process.Path) } catch { $null }
        if (-not $actualPath -or -not [string]::Equals($actualPath, $expectedNodePath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to stop process $processId because it is not this Atlas release's bundled Node runtime."
        }
        Stop-Process -Id $processId -Force
    }
}

$codex = (Get-Command codex.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $workPath -Force | Out-Null
$codexCopy = Join-Path $workPath "codex-plugin-installer.exe"
Copy-Item -LiteralPath $codex -Destination $codexCopy -Force

& $codexCopy plugin remove atlas@atlas-release
if ($LASTEXITCODE -ne 0) { Write-Warning "Atlas plugin was already absent or could not be removed." }
& $codexCopy plugin marketplace remove atlas-release
if ($LASTEXITCODE -ne 0) { Write-Warning "Atlas marketplace was already absent or could not be removed." }

Write-Host "Atlas was removed from Codex. Data remains at: $(Join-Path $workPath 'data')"
