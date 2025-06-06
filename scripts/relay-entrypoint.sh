#!/bin/bash

# Relay script with improved error handling and resource optimization
set -e

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Health check function
check_source() {
    log "Checking source availability: ${RTMP_SERVER}"
    timeout 10 ffprobe -v quiet -print_format json -show_streams "${RTMP_SERVER}" > /dev/null 2>&1
    return $?
}

# Main relay loop
while true; do
    log "Starting relay from ${RTMP_SERVER} to ${RELAY_TARGET}"
    
    # Check if source is available before attempting relay
    if ! check_source; then
        log "Source not available, waiting 30 seconds before retry..."
        sleep 30
        continue
    fi
    
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

    EXIT_CODE=$?
    log "FFmpeg exited with code: $EXIT_CODE"
    
    # Different handling based on exit code
    case $EXIT_CODE in
        0)
            log "Normal exit, restarting in 5 seconds..."
            sleep 5
            ;;
        124)
            log "Timeout occurred, restarting in 10 seconds..."
            sleep 10
            ;;
        *)
            log "Error occurred, waiting 30 seconds before retry..."
            sleep 30
            ;;
    esac
done