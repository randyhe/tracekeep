@echo off
setlocal
set "ATLAS_RELEASE_ROOT=%~dp0."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-Atlas.ps1" -ReleaseRoot "%ATLAS_RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Atlas installation failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Atlas is installed and running. Open a new Codex task to use it.
pause
endlocal
