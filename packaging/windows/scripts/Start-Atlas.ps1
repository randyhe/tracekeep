[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Resolve-ReleasePath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Test-PortAvailable {
    param([int]$Port)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        $listener.Stop()
    }
}

$root = Resolve-ReleasePath $ReleaseRoot
$nodePath = Join-Path $root "bundled-node\node.exe"
$mainPath = Join-Path $root "app\apps\atlasd\dist\main.js"
$webPath = Join-Path $root "app\apps\web\dist\index.html"
$seedPath = Join-Path $root "demo-seed"
$workPath = Join-Path $root "work"
$dataPath = Join-Path $workPath "demo-data"
$pidPath = Join-Path $workPath "atlas.pid"

foreach ($requiredPath in @($nodePath, $mainPath, $webPath, $seedPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "The release is incomplete. Missing: $requiredPath"
    }
}

New-Item -ItemType Directory -Path $workPath -Force | Out-Null
if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    Get-ChildItem -LiteralPath $seedPath -Force | Copy-Item -Destination $dataPath -Recurse -Force
}

$port = 4310..4319 | Where-Object { Test-PortAvailable $_ } | Select-Object -First 1
if ($null -eq $port) {
    throw "No free loopback port is available in the required 4310-4319 range."
}

$env:ATLAS_DATA_DIR = [System.IO.Path]::GetFullPath($dataPath)
$env:ATLAS_PORT = [string]$port
$quotedMainPath = '"' + $mainPath + '"'
$process = Start-Process -FilePath $nodePath -ArgumentList $quotedMainPath -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

$healthUrl = "http://127.0.0.1:$port/api/v1/health/ready"
$ready = $false
for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($process.HasExited) {
        throw "Atlas exited before it became ready (exit code $($process.ExitCode))."
    }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {
        Start-Sleep -Milliseconds 200
    }
}

if (-not $ready) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Atlas did not become ready at $healthUrl."
}

$seedFile = Join-Path $dataPath "demo-data.json"
$seedMarker = Join-Path $dataPath ".demo-seed-v1"
if ((Test-Path -LiteralPath $seedFile) -and -not (Test-Path -LiteralPath $seedMarker)) {
    $seed = Get-Content -LiteralPath $seedFile -Raw | ConvertFrom-Json
    $index = 0
    foreach ($item in $seed.items) {
        $index++
        $capture = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/v1/captures" `
            -Headers @{ "Idempotency-Key" = "demo-seed-capture-v1-$index" } -ContentType "application/json" `
            -Body (@{ text = [string]$item.text; title = [string]$item.title; sensitivity = "personal" } | ConvertTo-Json)
        $accepted = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/v1/reviews/$($capture.candidate.id)/actions" `
            -Headers @{ "Idempotency-Key" = "demo-seed-accept-v1-$index" } -ContentType "application/json" `
            -Body (@{ action = "accept"; expectedVersion = $capture.candidate.version } | ConvertTo-Json)
        if ($item.status -and $item.status -ne "open") {
            $patch = @{ expectedVersion = $accepted.outcome.version; status = [string]$item.status }
            if ($item.scheduledFor) {
                $patch.scheduledFor = if ($item.scheduledFor -is [datetime]) {
                    $item.scheduledFor.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                } else { [string]$item.scheduledFor }
            }
            Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:$port/api/v1/open-loops/$($accepted.outcome.id)" `
                -Headers @{ "Idempotency-Key" = "demo-seed-status-v1-$index" } -ContentType "application/json" `
                -Body ($patch | ConvertTo-Json) | Out-Null
        }
    }
    Set-Content -LiteralPath $seedMarker -Value (Get-Date).ToUniversalTime().ToString("o") -Encoding ascii
}

$url = "http://127.0.0.1:$port/today"
Write-Host "Atlas is running locally at $url"
Write-Host "Demo data: $dataPath"
if (-not $NoBrowser) { Start-Process $url }
