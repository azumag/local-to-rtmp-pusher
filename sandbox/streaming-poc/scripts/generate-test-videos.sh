#!/bin/bash

# 青色背景の待機画面動画を生成（10秒）
ffmpeg -f lavfi -i color=c=blue:s=1920x1080:r=30 \
       -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
       -t 10 \
       -c:v libx264 -preset ultrafast -crf 23 \
       -c:a aac -b:a 128k \
       -pix_fmt yuv420p \
       -y /app/videos/standby.mp4

# 緑色背景の本番映像動画を生成（30秒）
ffmpeg -f lavfi -i color=c=green:s=1920x1080:r=30 \
       -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
       -t 30 \
       -c:v libx264 -preset ultrafast -crf 23 \
       -c:a aac -b:a 128k \
       -pix_fmt yuv420p \
       -y /app/videos/main-content.mp4

echo "Test videos generated successfully!"