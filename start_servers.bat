@echo off
echo Starting Backend Server...
start cmd /k "cd /d %~dp0 && .\.venv\Scripts\activate && python -m uvicorn backend.api.main:app --reload"

echo Starting Frontend Server...
start cmd /k "cd /d %~dp0frontend && npm run dev"

echo =======================================================
echo Both servers are starting in separate terminal windows!
echo =======================================================
pause
