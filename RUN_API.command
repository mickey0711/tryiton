#!/bin/zsh
# TryIt4U — API Server Launcher
# Double-click this file to start the backend

cd "$(dirname "$0")/services/api"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🚀 TryIt4U API Server              ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "📡 Starting on http://localhost:8080"
echo "🗄️  Database: Neon (Cloud)"
echo "☁️  Storage:  Cloudflare R2"
echo "🤖 AI:       Replicate"
echo ""
echo "Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npx tsx src/server.ts
