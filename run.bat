@echo off
title DepthMap Maker Launcher
echo ===================================================
echo             DEPTHMAP MAKER LAUNCHER
echo ===================================================
echo.

:: Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in the PATH.
    echo Please install Python 3.8 or higher from https://www.python.org/
    pause
    exit /b
)

:: Create Virtual Environment if it doesn't exist
if not exist .venv (
    echo [INFO] Creating Python virtual environment in .venv...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b
    )
    echo [INFO] Virtual environment created successfully.
)

:: Activate Virtual Environment
echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat

:: Install/Upgrade dependencies
echo [INFO] Checking and installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b
)
echo [INFO] Dependencies installed successfully.

:: Open the browser in a few seconds (gives uvicorn a moment to start)
echo [INFO] Starting browser...
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8000/

:: Start the server
echo [INFO] Starting FastAPI local server...
echo.
python server.py

pause
