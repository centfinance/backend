#!/bin/bash

# Deployment script for Balancer v3 Backend
# This script builds and starts all services

set -e

echo "🚀 Starting Balancer v3 Backend Deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your configuration."
    exit 1
fi

# Create logs directory
mkdir -p logs

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Build the project
echo "🏗️  Building TypeScript..."
yarn build

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Stop existing processes
echo "🛑 Stopping existing processes..."
pm2 delete all 2>/dev/null || true

# Start all services with PM2
echo "✅ Starting services with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Show status
echo ""
echo "📊 Service Status:"
pm2 status

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Useful commands:"
echo "  pm2 logs              - View all logs"
echo "  pm2 logs balancer-api - View API logs"
echo "  pm2 logs balancer-worker - View worker logs"
echo "  pm2 logs balancer-scheduler - View scheduler logs"
echo "  pm2 restart all      - Restart all services"
echo "  pm2 stop all          - Stop all services"
echo "  pm2 monit             - Monitor services"
