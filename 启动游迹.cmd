@echo off
setlocal
set "PLAYVAULT_DATA_DIR=%~dp0data"
set "TEMP=%~dp0data\temp"
set "TMP=%TEMP%"
if not exist "%TEMP%" mkdir "%TEMP%"
if exist "%~dp0release\win-unpacked\PlayVault.exe" (
  start "" "%~dp0release\win-unpacked\PlayVault.exe"
  exit /b 0
)
cd /d "%~dp0"
call npm.cmd start
