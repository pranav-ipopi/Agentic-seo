@echo off
title BookmarkBot 24/7 Worker
:: Set current directory to the folder where the bat file is located
cd /d "%~dp0"

echo [=========================================]
echo [      BookmarkBot Initializing...        ]
echo [=========================================]
echo.

IF NOT EXIST "venv\Scripts\activate.bat" (
    echo Creating new virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate

echo.
echo Installing/Upgrading requirements...
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.

:LOOP
echo [ %date% %time% ] Starting local_worker.py...
python local_worker.py

echo.
echo [ %date% %time% ] WARNING: Worker stopped or crashed!
echo Restarting in 10 seconds to maintain 24/7 uptime...
timeout /t 10 /nobreak
goto LOOP
