#!/bin/bash
# FitCheck AI Pro - Quick Launch Script for Linux/Mac

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       🎯 FitCheck AI Pro - Smart Launch System            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed. Install from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js detected: $(node -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Installation failed"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              🚀 Starting FitCheck AI Pro                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Backend Server: http://localhost:5000"
echo "🌐 Frontend: http://localhost:8000"
echo "🧪 API Console: http://localhost:8000/api-console.html"
echo ""
echo "Hint: Open new terminal and run:"
echo "      python3 -m http.server 8000"
echo "      or npx http-server"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
