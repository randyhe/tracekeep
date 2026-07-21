@echo off
setlocal
set "TRACEKEEP_RELEASE_ROOT=%~dp0."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Reset-Demo.ps1" -ReleaseRoot "%TRACEKEEP_RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Tracekeep demo data was not reset. See the error above.
  pause
  exit /b 1
)
echo.
echo Tracekeep demo data has been reset.
pause
endlocal
