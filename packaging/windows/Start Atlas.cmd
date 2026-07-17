@echo off
setlocal EnableDelayedExpansion
set "ATLAS_RELEASE_ROOT=%~dp0."
set "ATLAS_START_OPTIONS="
set "ATLAS_NONINTERACTIVE="
:parse
if "%~1"=="" goto run
if /I "%~1"=="--no-browser" (
  set "ATLAS_START_OPTIONS=!ATLAS_START_OPTIONS! -NoBrowser"
  set "ATLAS_NONINTERACTIVE=1"
)
if /I "%~1"=="--demo" set "ATLAS_START_OPTIONS=!ATLAS_START_OPTIONS! -Demo"
shift /1
goto parse
:run
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Atlas.ps1" -ReleaseRoot "%ATLAS_RELEASE_ROOT%" !ATLAS_START_OPTIONS!
if errorlevel 1 (
  echo.
  echo Atlas did not start. See the error above.
  if defined ATLAS_NONINTERACTIVE exit /b 1
  pause
  exit /b 1
)
endlocal
