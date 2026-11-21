@echo off
chcp 65001 >nul
setlocal
rem Encodes the actor/prop colour textures that still ship as JPG/PNG into KTX2.
rem Writes only into .cache\actor-ktx2. Needs ktx.exe (KTX-Software) on PATH or in KTX_EXE.
cd /d "%~dp0ArcherPreview"
set "NODE=node"
if exist "%~dp0Tools\portable\runtime\win-x64\node\node.exe" set "NODE=%~dp0Tools\portable\runtime\win-x64\node\node.exe"
"%NODE%" scripts\convert-actor-ktx2.mjs
echo.
pause
