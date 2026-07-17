@echo off
setlocal
set "ATLAS_RELEASE_ROOT=%~dp0."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Uninstall-Atlas.ps1" -ReleaseRoot "%ATLAS_RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Atlas uninstallation failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Atlas was removed from Codex. Local data was preserved in the work folder.
echo Delete this extracted Atlas folder only when you no longer need that data.
pause
endlocal
