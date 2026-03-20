#!/bin/bash
# FitCheck - Quick launch script for Linux/Mac

echo ""
echo "================================"
echo " FitCheck - Setup and Launch"
echo "================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js is not installed."
    echo "Install it from: https://nodejs.org/"
    exit 1
fi

echo "[1/3] Node.js detected: $(node -v)"
echo "[2/3] Installing dependencies..."
npm install >/dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed."
    exit 1
fi

echo "[3/3] Starting FitCheck on http://localhost:5000"
echo ""
echo "Open these pages after the server starts:"
echo "  Main app:    http://localhost:5000/"
echo "  API console: http://localhost:5000/api-console.html"
echo "  API tester:  http://localhost:5000/api-test.html"
echo ""
echo "Use 'npm run advanced' if you want the smoothed API variant instead."
echo "Press Ctrl+C to stop the server."
echo ""

npm start
