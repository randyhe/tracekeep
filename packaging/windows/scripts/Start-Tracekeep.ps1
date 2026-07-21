[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot,
    [switch]$NoBrowser,
    [switch]$Demo
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

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
$mainPath = Join-Path $root "app\apps\tracekeepd\dist\main.js"
$webPath = Join-Path $root "app\apps\web\dist\index.html"
$seedPath = Join-Path $root "demo-seed"
$workPath = Join-Path $root "work"
$dataPath = Join-Path $workPath $(if ($Demo) { "demo-data" } else { "data" })
$pidPath = Join-Path $workPath "tracekeep.pid"
$tokenPath = Join-Path $workPath "auth-token.dpapi"
$portPath = Join-Path $workPath "tracekeep-port.txt"

foreach ($requiredPath in @($nodePath, $mainPath, $webPath, $seedPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "The release is incomplete. Missing: $requiredPath"
    }
}

New-Item -ItemType Directory -Path $workPath -Force | Out-Null
if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw "Tracekeep is not installed yet. Double-click Install Tracekeep.cmd first."
}
$protectedToken = [System.IO.File]::ReadAllBytes($tokenPath)
$plainToken = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedToken,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$authToken = [System.Text.Encoding]::UTF8.GetString($plainToken)
$authHeaders = @{ Authorization = "Bearer $authToken" }

if (Test-Path -LiteralPath $pidPath) {
    $existingProcessId = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingProcessId -and (Get-Process -Id $existingProcessId -ErrorAction SilentlyContinue)) {
        $existingPort = if (Test-Path -LiteralPath $portPath) { [int](Get-Content -LiteralPath $portPath -Raw) } else { 4310 }
        $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$existingPort/api/v1/health/ready" -TimeoutSec 2
        if ($existingHealth.status -ne "ready") { throw "The existing Tracekeep process is not ready." }
        $existingUrl = "http://127.0.0.1:$existingPort/today#token=$([uri]::EscapeDataString($authToken))"
        if (-not $NoBrowser) { Start-Process $existingUrl }
        Write-Host "Tracekeep is already running locally at http://127.0.0.1:$existingPort/today"
        return
    }
}

if (-not (Test-Path -LiteralPath $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    Get-ChildItem -LiteralPath $seedPath -Force | Copy-Item -Destination $dataPath -Recurse -Force
}

$preferredPort = if (Test-Path -LiteralPath $portPath) { [int](Get-Content -LiteralPath $portPath -Raw) } else { 4310 }
$candidatePorts = @($preferredPort) + @(4310..4319 | Where-Object { $_ -ne $preferredPort })
$port = $candidatePorts | Where-Object { $_ -ge 4310 -and $_ -le 4319 -and (Test-PortAvailable $_) } | Select-Object -First 1
if ($null -eq $port) { throw "All Tracekeep loopback ports from 4310 through 4319 are in use." }
Set-Content -LiteralPath $portPath -Value $port -Encoding ascii

$env:TRACEKEEP_DATA_DIR = [System.IO.Path]::GetFullPath($dataPath)
$env:TRACEKEEP_PORT = [string]$port
$env:TRACEKEEP_AUTH_TOKEN = $authToken
$quotedMainPath = '"' + $mainPath + '"'
$process = Start-Process -FilePath $nodePath -ArgumentList $quotedMainPath -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

$healthUrl = "http://127.0.0.1:$port/api/v1/health/ready"
$ready = $false
for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($process.HasExited) {
        throw "Tracekeep exited before it became ready (exit code $($process.ExitCode))."
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
    throw "Tracekeep did not become ready at $healthUrl."
}

$seedFile = Join-Path $dataPath "demo-data.json"
$seedMarker = Join-Path $dataPath ".demo-seed-v1"
if ($Demo -and (Test-Path -LiteralPath $seedFile) -and -not (Test-Path -LiteralPath $seedMarker)) {
    $seed = Get-Content -LiteralPath $seedFile -Raw | ConvertFrom-Json
    $index = 0
    foreach ($item in $seed.items) {
        $index++
        $capture = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/v1/captures" `
            -Headers @{ Authorization = $authHeaders.Authorization; "Idempotency-Key" = "demo-seed-capture-v1-$index" } -ContentType "application/json" `
            -Body (@{ text = [string]$item.text; title = [string]$item.title; sensitivity = "personal" } | ConvertTo-Json)
        $accepted = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/v1/reviews/$($capture.candidate.id)/actions" `
            -Headers @{ Authorization = $authHeaders.Authorization; "Idempotency-Key" = "demo-seed-accept-v1-$index" } -ContentType "application/json" `
            -Body (@{ action = "accept"; expectedVersion = $capture.candidate.version } | ConvertTo-Json)
        if ($item.status -and $item.status -ne "open") {
            $patch = @{ expectedVersion = $accepted.outcome.version; status = [string]$item.status }
            if ($item.scheduledFor) {
                $patch.scheduledFor = if ($item.scheduledFor -is [datetime]) {
                    $item.scheduledFor.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                } else { [string]$item.scheduledFor }
            }
            Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1:$port/api/v1/open-loops/$($accepted.outcome.id)" `
                -Headers @{ Authorization = $authHeaders.Authorization; "Idempotency-Key" = "demo-seed-status-v1-$index" } -ContentType "application/json" `
                -Body ($patch | ConvertTo-Json) | Out-Null
        }
    }
    Set-Content -LiteralPath $seedMarker -Value (Get-Date).ToUniversalTime().ToString("o") -Encoding ascii
}

$url = "http://127.0.0.1:$port/today#token=$([uri]::EscapeDataString($authToken))"
Write-Host "Tracekeep is running locally at $url"
Write-Host "Tracekeep data: $dataPath"
if (-not $NoBrowser) { Start-Process $url }
