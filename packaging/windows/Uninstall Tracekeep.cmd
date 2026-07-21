@echo off
setlocal
set "TRACEKEEP_RELEASE_ROOT=%~dp0."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Uninstall-Tracekeep.ps1" -ReleaseRoot "%TRACEKEEP_RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Tracekeep uninstallation failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Tracekeep was removed from Codex. Local data was preserved in the work folder.
echo Delete this extracted Tracekeep folder only when you no longer need that data.
pause
endlocal
