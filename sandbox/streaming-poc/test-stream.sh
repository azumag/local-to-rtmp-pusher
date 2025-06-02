#!/bin/bash

echo "🚀 Starting streaming POC test..."

# Build and start containers
echo "📦 Building Docker containers..."
docker-compose build

echo "🔧 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Check if RTMP server is running
echo "🔍 Checking RTMP server status..."
curl -s http://localhost:8080/stat > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ RTMP server is running"
else
    echo "❌ RTMP server is not responding"
    exit 1
fi

# Monitor logs
echo "📺 Monitoring stream (press Ctrl+C to stop)..."
echo ""
echo "You can view the stream at:"
echo "  - rtmp://localhost:1935/live/stream"
echo "  - Use VLC or ffplay: ffplay rtmp://localhost:1935/live/stream"
echo ""
echo "Stream timeline:"
echo "  0-10s:  Blue standby screen"
echo "  10-40s: Green main content"
echo "  40-50s: Blue standby screen"
echo "  50s:    Stream stops"
echo ""

docker-compose logs -f ffmpeg-streamer