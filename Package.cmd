@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0Tools\portable\runtime\win-x64\node\node.exe" (
  "%~dp0Tools\portable\runtime\win-x64\node\node.exe" "%~dp0Tools\portable\cli.mjs" pack
) else (
  node "%~dp0Tools\portable\cli.mjs" pack
)
set "PORTABLE_EXIT=%ERRORLEVEL%"
if not "%PORTABLE_EXIT%"=="0" pause
exit /b %PORTABLE_EXIT%
