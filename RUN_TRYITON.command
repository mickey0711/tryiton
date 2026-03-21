#!/bin/bash
# ─── TryItOn Platform Launcher ────────────────────────────────────────────────
# Double-click this from Finder or run from terminal

cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║          🚀 TryItOn Platform Starting...           ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# Copy .env if needed
if [ ! -f .env ]; then
  echo "📋 Creating .env from .env.example..."
  cp .env.example .env
fi

echo "🐳 Starting all services with Docker Compose..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 8

# Check API health
for i in {1..15}; do
  if curl -s http://localhost:8080/health | grep -q '"ok":true'; then
    break
  fi
  echo "   Waiting for API... ($i/15)"
  sleep 2
done

echo ""
echo "✅ All services running!"
echo ""
echo "  🌐 Web App:     http://localhost:3000"
echo "  🔌 API:         http://localhost:8080"
echo "  📊 API Health:  http://localhost:8080/health"
echo ""
echo "─────────────────────────────────────────────────────"
echo "📦 Build Chrome Extension:"
echo "   cd /Users/mickeycohen/Desktop/TryItOn"
echo "   npm run build:extension"
echo "   Then load apps/extension/dist in chrome://extensions"
echo "─────────────────────────────────────────────────────"
echo ""
echo "📋 View logs: docker-compose logs -f"
echo "🛑 Stop all:  docker-compose down"
echo ""

# Optionally open browser
sleep 1
open http://localhost:3000
