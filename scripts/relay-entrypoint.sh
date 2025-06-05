#!/bin/bash

while true; do

    ffmpeg -i "${RTMP_SERVER}" -c:v libx264 -preset veryfast -b:v 2500k -maxrate 2500k -bufsize 6291k -c:a aac -b:a 128k -f flv "${RELAY_TARGET}"
    
    echo "[$(date)] FFmpeg exited, restarting in 5 seconds..."
    sleep 5
done