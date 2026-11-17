@echo off
chcp 65001 >nul
setlocal
rem Builds MoonForest 0.2 and 0.3 from the current source and adds them to
rem ArcherPreviewSite. 0.1 stays byte-identical. Deploys only after a push to
rem the deployment branch.
cd /d "%~dp0ArcherPreview"
set "NODE=node"
if exist "%~dp0Tools\portable\runtime\win-x64\node\node.exe" set "NODE=%~dp0Tools\portable\runtime\win-x64\node\node.exe"
for %%S in (build-moonforest-0.2 sync-moonforest-0.2 build-moonforest-0.3 sync-moonforest-0.3) do (
  echo.
  echo === %%S ===
  "%NODE%" scripts\%%S.mjs
  if errorlevel 1 (
    echo.
    echo [실패] %%S 단계에서 멈췄습니다. 위 오류를 Claude에게 알려 주세요.
    pause
    exit /b 1
  )
)
echo.
echo [완료] 배포 파일을 준비했습니다. 이제 Claude에게 "빌드 끝"이라고 알려 주세요.
pause
