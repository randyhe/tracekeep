@echo off
setlocal EnableDelayedExpansion
set "TRACEKEEP_RELEASE_ROOT=%~dp0."
set "TRACEKEEP_START_OPTIONS="
set "TRACEKEEP_NONINTERACTIVE="
:parse
if "%~1"=="" goto run
if /I "%~1"=="--no-browser" (
  set "TRACEKEEP_START_OPTIONS=!TRACEKEEP_START_OPTIONS! -NoBrowser"
  set "TRACEKEEP_NONINTERACTIVE=1"
)
if /I "%~1"=="--demo" set "TRACEKEEP_START_OPTIONS=!TRACEKEEP_START_OPTIONS! -Demo"
shift /1
goto parse
:run
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Tracekeep.ps1" -ReleaseRoot "%TRACEKEEP_RELEASE_ROOT%" !TRACEKEEP_START_OPTIONS!
if errorlevel 1 (
  echo.
  echo Tracekeep did not start. See the error above.
  if defined TRACEKEEP_NONINTERACTIVE exit /b 1
  pause
  exit /b 1
)
endlocal
