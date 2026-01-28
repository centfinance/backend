#!/bin/bash

# Simple start script (alternative to PM2)
# Runs all three services in separate processes

set -e

echo "🚀 Starting Balancer v3 Backend Services..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Build if needed
if [ ! -d "dist" ]; then
    echo "🏗️  Building project..."
    yarn build
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $API_PID $WORKER_PID $SCHEDULER_PID 2>/dev/null || true
    exit
}

trap cleanup SIGINT SIGTERM

# Start API Server
echo "🌐 Starting API Server..."
WORKER=false SCHEDULER=false yarn start > logs/api.log 2>&1 &
API_PID=$!
echo "  API Server PID: $API_PID"

# Start Worker
echo "⚙️  Starting Worker..."
WORKER=true SCHEDULER=false yarn start > logs/worker.log 2>&1 &
WORKER_PID=$!
echo "  Worker PID: $WORKER_PID"

# Start Scheduler
echo "📅 Starting Scheduler..."
WORKER=false SCHEDULER=true yarn start > logs/scheduler.log 2>&1 &
SCHEDULER_PID=$!
echo "  Scheduler PID: $SCHEDULER_PID"

echo ""
echo "✅ All services started!"
echo ""
echo "Logs:"
echo "  tail -f logs/api.log"
echo "  tail -f logs/worker.log"
echo "  tail -f logs/scheduler.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all processes
wait
