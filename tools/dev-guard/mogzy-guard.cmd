@echo off
rem Thin shim so the guard can be called from cmd, PowerShell and Git Bash alike.
rem -ExecutionPolicy Bypass applies to this single process only; it changes no machine or user setting.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0mogzy-guard.ps1" %*
exit /b %ERRORLEVEL%
