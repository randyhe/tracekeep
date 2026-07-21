@echo off
setlocal
set "TRACEKEEP_RELEASE_ROOT=%~dp0."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-Tracekeep.ps1" -ReleaseRoot "%TRACEKEEP_RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Tracekeep installation failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Tracekeep is installed and running. Open a new Codex task to use it.
pause
endlocal
