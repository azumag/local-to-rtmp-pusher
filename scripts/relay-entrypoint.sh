#!/bin/bash

# Main relay loop
while true; do
    
    # Start FFmpeg with original encoding settings
    ffmpeg \
        -i "${RTMP_SERVER}" \
        -c:v libx264 \
        -preset ultrafast \
        -b:v 1500k \
        -maxrate 1500k \
        -bufsize 3000k \
        -c:a aac \
        -b:a 64k \
        -f flv \
        "${RELAY_TARGET}"    

   echo "[$(date)] FFmpeg exited, restarting in 5 seconds..."
   sleep 5 
done