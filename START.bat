@echo off
REM FitCheck AI - Quick Start Script for Windows

echo.
echo ================================
echo  FitCheck AI - Setup & Launch
echo ================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/4] Node.js detected
echo [2/4] Installing dependencies...
call npm install

echo [3/4] Starting FitCheck...
echo.
echo =================================
echo App and API starting on port 5000...
echo Open your browser to:
echo http://localhost:5000
echo =================================
echo.

start "" http://localhost:5000

REM Start the server
node server.js

pause
