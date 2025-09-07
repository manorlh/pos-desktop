#!/bin/bash

echo "🚀 Starting POS Desktop Development Server..."
echo "This will start both Vite dev server and Electron app"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install --legacy-peer-deps
fi

# Start the development server
echo "🔧 Starting development servers..."
npm run electron:dev
