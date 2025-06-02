#!/bin/bash

echo "🎥 Testing RTMP-only streaming..."

# Stop and rebuild containers
docker-compose down
export CONTROLLER_MODE=simple
docker-compose up -d --build

echo "⏳ Waiting for stream to stabilize..."
sleep 15

echo "📊 RTMP Stream Status:"
curl -s http://localhost:8080/stat | grep -A 20 "<stream>" | head -15

echo ""
echo "🔍 Testing RTMP stream reception..."

# Test RTMP stream with ffmpeg
timeout 5 ffmpeg -i rtmp://localhost:1935/live/stream -t 1 -f null - 2>&1 | grep -E "Stream|Video|Audio|Duration|error" | head -10

echo ""
echo "📺 To test with VLC:"
echo "   1. Open VLC"
echo "   2. Media > Open Network Stream"
echo "   3. Enter: rtmp://localhost:1935/live/stream"
echo "   4. Click Play"

echo ""
echo "🚀 Launching VLC in 3 seconds..."
sleep 3

# Launch VLC with the RTMP stream
vlc rtmp://localhost:1935/live/stream &

echo "VLC launched. Monitor for any error messages."