@echo off
cd /d "%~dp0"
rem pig local dev entrypoint. Runs the LOCALLY-installed 1dxway (devDep,
rem ^0.1.21) straight through bun -- no bunx, no version pin, no network hop, so
rem startup is fast and tracks whatever 0.1.x we've installed.
rem
rem   dev start          -> launch the 1dx monitor (reads ./1dx.json): starts
rem                         the Tauri dev service (Vite on 1420 + Rust window).
rem   dev help           -> show 1dx commands.
rem
rem First run (or after a fresh clone) auto-installs deps via `bun install`.

set "ONEDX=%~dp0node_modules\1dxway\bin\1dx.js"
if not exist "%ONEDX%" (
  echo [dev] 1dxway not installed yet -- running bun install ...
  call bun install || (echo [dev] bun install failed & exit /b 1)
)
bun "%ONEDX%" %*
