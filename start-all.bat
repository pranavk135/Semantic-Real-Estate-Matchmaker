@echo off
rem Opens the sync watcher and the web app in two windows (YOUR laptop).
start "sync-watcher" cmd /k "cd /d %~dp0 && npm run sync:watch"
start "web-app" cmd /k "cd /d %~dp0 && npm run dev"
