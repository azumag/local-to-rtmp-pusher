#!/bin/bash

echo "Starting UDP to RTMP receiver..."
echo "UDP listening on: 0.0.0.0:1234"
echo "RTMP target: rtmp://rtmp-server:1935/live/test-stream"

# Test FFmpeg installation
echo "Testing FFmpeg..."
ffmpeg -version

while true; do
    echo "[$(date)] Waiting for UDP stream..."
    
    # Simple FFmpeg command without line breaks
    # ffmpeg -i udp://0.0.0.0:1234?timeout=0\&buffer_size=65536 -c copy -f flv -loglevel info -y rtmp://rtmp-server:1935/live/test-stream
    ffmpeg -avoid_negative_ts make_zero -fflags '+genpts' -i 'udp://0.0.0.0:1234?timeout=0&buffer_size=65536' -c copy -f flv rtmp://rtmp-server:1935/live/stream
    
    echo "[$(date)] FFmpeg exited, restarting in 5 seconds..."
    sleep 5
done