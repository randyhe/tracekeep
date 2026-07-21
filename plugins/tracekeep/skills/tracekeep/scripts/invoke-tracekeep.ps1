[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("capture", "today", "open-loops", "search", "complete", "snooze", "review")]
    [string]$Operation,

    [string]$Text,
    [string]$Title,
    [ValidateSet("open_loop", "decision", "reference")]
    [string]$CandidateType = "open_loop",
    [ValidateSet("personal", "work_summary_only", "restricted")]
    [string]$Sensitivity = "personal",
    [ValidateSet("open", "waiting", "scheduled", "done", "dismissed")]
    [string]$Status,
    [string]$Query,
    [string]$Id,
    [int]$ExpectedVersion,
    [Nullable[datetime]]$ScheduledFor,
    [string]$BaseUrl = "http://127.0.0.1:4310"
)

$ErrorActionPreference = "Stop"

if ($BaseUrl -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?$') {
    throw "Tracekeep BaseUrl must use loopback HTTP."
}

function Invoke-TracekeepRequest {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [ValidateSet("GET", "POST", "PATCH")][string]$Method = "GET",
        [hashtable]$Body
    )

    $arguments = @{
        Uri = "$BaseUrl$Path"
        Method = $Method
        TimeoutSec = 10
    }
    if ($Body) {
        $arguments.Headers = @{ "Idempotency-Key" = [guid]::NewGuid().ToString() }
        $arguments.ContentType = "application/json"
        $arguments.Body = $Body | ConvertTo-Json -Compress
    }
    Invoke-RestMethod @arguments
}

$ready = Invoke-TracekeepRequest -Path "/api/v1/health/ready"
if ($ready.status -ne "ready") {
    throw "Tracekeep is not ready at $BaseUrl."
}

switch ($Operation) {
    "capture" {
        if ([string]::IsNullOrWhiteSpace($Text)) { throw "Text is required for capture." }
        $body = @{
            text = $Text
            sourceType = "codex"
            candidateType = $CandidateType
            sensitivity = $Sensitivity
        }
        if (-not [string]::IsNullOrWhiteSpace($Title)) { $body.title = $Title }
        $result = Invoke-TracekeepRequest -Path "/api/v1/captures" -Method "POST" -Body $body
        [pscustomobject]@{
            status = "saved_for_review"
            candidateId = $result.candidate.id
            candidateType = $result.candidate.candidateType
            title = $result.candidate.title
            sourceType = $result.source.type
            reviewUrl = "$BaseUrl/review"
        }
    }
    "today" { Invoke-TracekeepRequest -Path "/api/v1/today" }
    "open-loops" {
        $suffix = if ($Status) { "?status=$([uri]::EscapeDataString($Status))" } else { "" }
        Invoke-TracekeepRequest -Path "/api/v1/open-loops$suffix"
    }
    "search" {
        if ([string]::IsNullOrWhiteSpace($Query)) { throw "Query is required for search." }
        Invoke-TracekeepRequest -Path "/api/v1/search?q=$([uri]::EscapeDataString($Query))"
    }
    "complete" {
        if ([string]::IsNullOrWhiteSpace($Id) -or $ExpectedVersion -lt 1) { throw "Id and ExpectedVersion are required for complete." }
        Invoke-TracekeepRequest -Path "/api/v1/open-loops/$([uri]::EscapeDataString($Id))" -Method "PATCH" -Body @{
            status = "done"
            expectedVersion = $ExpectedVersion
        }
    }
    "snooze" {
        if ([string]::IsNullOrWhiteSpace($Id) -or $ExpectedVersion -lt 1 -or $null -eq $ScheduledFor) {
            throw "Id, ExpectedVersion, and ScheduledFor are required for snooze."
        }
        Invoke-TracekeepRequest -Path "/api/v1/open-loops/$([uri]::EscapeDataString($Id))" -Method "PATCH" -Body @{
            status = "scheduled"
            scheduledFor = $ScheduledFor.Value.ToUniversalTime().ToString("o")
            expectedVersion = $ExpectedVersion
        }
    }
    "review" { Invoke-TracekeepRequest -Path "/api/v1/reviews" }
}
