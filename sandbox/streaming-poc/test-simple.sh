#!/bin/bash

echo "🚀 Starting simple streaming test..."

# Stop existing containers
docker-compose down

# Start with simple mode
export CONTROLLER_MODE=simple

# Build and start
docker-compose build
docker-compose up -d

# Monitor logs
echo "📺 Monitoring stream..."
echo "You can view at: rtmp://localhost:1935/live/stream"
echo ""

docker-compose logs -f ffmpeg-streamer