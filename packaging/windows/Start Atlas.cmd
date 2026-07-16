@echo off
setlocal
set "ATLAS_RELEASE_ROOT=%~dp0."
set "ATLAS_START_OPTION="
if /I "%~1"=="--no-browser" set "ATLAS_START_OPTION=-NoBrowser"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Atlas.ps1" -ReleaseRoot "%ATLAS_RELEASE_ROOT%" %ATLAS_START_OPTION%
if errorlevel 1 (
  echo.
  echo Atlas did not start. See the error above.
  pause
  exit /b 1
)
endlocal
