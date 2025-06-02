#!/bin/bash

echo "🎥 Testing VLC compatibility..."

# Restart containers with new config
docker-compose down
export CONTROLLER_MODE=simple
docker-compose up -d --build

echo "⏳ Waiting for stream to start..."
sleep 10

echo "📊 Checking RTMP stats..."
curl -s http://localhost:8080/stat | grep -A 5 "<stream>"

echo ""
echo "🔍 Testing different stream URLs:"
echo ""

# Test RTMP with ffmpeg first
echo "1. Testing RTMP with ffmpeg probe..."
timeout 5 ffmpeg -i rtmp://localhost:1935/live/stream -f null - 2>&1 | grep -E "Stream|Video|Audio|Error" | head -5

echo ""
echo "2. Testing HLS endpoint..."
sleep 5
curl -s http://localhost:8080/hls/stream.m3u8 | head -10

echo ""
echo "3. Launching VLC with different URLs..."

echo "📺 Try these URLs in VLC:"
echo "   RTMP: rtmp://localhost:1935/live/stream"
echo "   HLS:  http://localhost:8080/hls/stream.m3u8"

# Test VLC with RTMP (background, will fail gracefully)
echo ""
echo "Testing VLC with RTMP (10 seconds)..."
timeout 10 vlc --intf dummy --play-and-exit rtmp://localhost:1935/live/stream 2>&1 | grep -E "error|Error|failed|Failed" | head -5

echo ""
echo "Testing VLC with HLS (10 seconds)..."
timeout 10 vlc --intf dummy --play-and-exit http://localhost:8080/hls/stream.m3u8 2>&1 | grep -E "error|Error|failed|Failed" | head -5