param(
  [Parameter(Mandatory = $true)]
  [string]$Ffmpeg
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$outputDirectory = Join-Path $repositoryRoot "output\playwright\final-video"
$rawVideo = Join-Path $outputDirectory "tracekeep-build-week-raw.webm"
$finalVideo = Join-Path $outputDirectory "tracekeep-build-week-final.mp4"
$narrationFile = Join-Path $repositoryRoot "docs\competition\video-narration.txt"
$subtitleFile = Join-Path $repositoryRoot "docs\competition\tracekeep-build-week-final.srt"
$audioDirectory = Join-Path $outputDirectory "narration-clips"

if (-not (Test-Path -LiteralPath $Ffmpeg -PathType Leaf)) { throw "ffmpeg was not found: $Ffmpeg" }
if (-not (Test-Path -LiteralPath $rawVideo -PathType Leaf)) { throw "Raw recording was not found: $rawVideo" }
if (-not (Test-Path -LiteralPath $subtitleFile -PathType Leaf)) { throw "Subtitle file was not found: $subtitleFile" }

New-Item -ItemType Directory -Path $audioDirectory -Force | Out-Null
$paragraphs = (Get-Content -LiteralPath $narrationFile -Raw) -split "(?:\r?\n){2,}" | Where-Object { $_.Trim() }
$starts = @(0, 12000, 36000, 56000, 78000, 100000, 120000, 138000)
if ($paragraphs.Count -ne $starts.Count) { throw "Expected $($starts.Count) narration paragraphs, found $($paragraphs.Count)." }

Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $zira = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like "*Zira*" } | Select-Object -First 1
  if ($zira) { $synth.SelectVoice($zira.VoiceInfo.Name) }
  $synth.Rate = 0
  $synth.Volume = 100
  $clipPaths = @()
  for ($index = 0; $index -lt $paragraphs.Count; $index += 1) {
    $clipPath = Join-Path $audioDirectory ("cue-{0:d2}.wav" -f ($index + 1))
    $synth.SetOutputToWaveFile($clipPath)
    $synth.Speak($paragraphs[$index].Trim())
    $clipPaths += $clipPath
  }
} finally {
  $synth.Dispose()
}

$arguments = @("-y", "-i", $rawVideo)
foreach ($clipPath in $clipPaths) { $arguments += @("-i", $clipPath) }
$filters = @()
for ($index = 0; $index -lt $clipPaths.Count; $index += 1) {
  $inputIndex = $index + 1
  $delay = $starts[$index]
  $filters += "[$($inputIndex):a]adelay=$delay|$delay[a$index]"
}
$audioInputs = (0..($clipPaths.Count - 1) | ForEach-Object { "[a$_]" }) -join ""
$filters += "$audioInputs" + "amix=inputs=$($clipPaths.Count):duration=longest:normalize=0,apad=pad_dur=180[aout]"
$subtitleFilter = "subtitles=docs/competition/tracekeep-build-week-final.srt:force_style='FontName=Segoe UI,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=24'"

$arguments += @(
  "-filter_complex", ($filters -join ";"),
  "-map", "0:v:0", "-map", "[aout]",
  "-vf", $subtitleFilter,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "25",
  "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
  $finalVideo
)

Push-Location $repositoryRoot
try {
  & $Ffmpeg @arguments
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Get-Item -LiteralPath $finalVideo | Select-Object FullName, Length, LastWriteTime
