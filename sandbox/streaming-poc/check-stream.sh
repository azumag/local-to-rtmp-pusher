#!/bin/bash

echo "🔍 Checking streaming status..."

# Check containers
echo -e "\n📦 Container Status:"
docker ps | grep streaming

# Check RTMP stats
echo -e "\n📊 RTMP Server Stats:"
curl -s http://localhost:8080/stat 2>/dev/null || echo "RTMP stats not available"

# Test viewing with ffplay
echo -e "\n🎥 To view the stream, run:"
echo "ffplay rtmp://localhost:1935/live/stream"

# Show FFmpeg logs
echo -e "\n📜 Recent FFmpeg logs:"
docker logs streaming-ffmpeg --tail 10