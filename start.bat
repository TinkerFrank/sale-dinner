@echo off
cd /d "%~dp0"
where py >nul 2>&1 && (py server.py) || (python server.py)
pause
