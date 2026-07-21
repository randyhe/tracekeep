$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$inputText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputText)) { exit 0 }

$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$nodePath = Join-Path $pluginRoot "runtime\node.exe"
$scriptPath = Join-Path $pluginRoot "hooks\stop-capture.mjs"
$releaseRootPath = Join-Path $pluginRoot "release-root.txt"

if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $scriptPath)) { exit 0 }

if (Test-Path -LiteralPath $releaseRootPath) {
    try {
        $releaseRoot = [System.IO.Path]::GetFullPath((Get-Content -LiteralPath $releaseRootPath -Raw).Trim())
        $tokenPath = Join-Path $releaseRoot "work\auth-token.dpapi"
        $portPath = Join-Path $releaseRoot "work\tracekeep-port.txt"
        if ((Test-Path -LiteralPath $tokenPath) -and (Test-Path -LiteralPath $portPath)) {
            $protected = [System.IO.File]::ReadAllBytes($tokenPath)
            $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
                $protected,
                $null,
                [System.Security.Cryptography.DataProtectionScope]::CurrentUser
            )
            $env:TRACEKEEP_TOKEN = [System.Text.Encoding]::UTF8.GetString($plain)
            $port = [int](Get-Content -LiteralPath $portPath -Raw)
            if ($port -ge 4310 -and $port -le 4319) {
                $env:TRACEKEEP_BASE_URL = "http://127.0.0.1:$port"
            }
        }
    }
    catch {
        # The JavaScript hook will fail closed and use its private local retry queue.
    }
}

$inputText | & $nodePath $scriptPath
exit $LASTEXITCODE
