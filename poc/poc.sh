# 1つのFFmpegでUDP受信→RTMP配信
ffmpeg -i "udp://127.0.0.1:1234?timeout=0" -c copy -f flv rtmp://localhost:1936/live/stream

# 動画を順次UDP送信（別プロセス）
ffmpeg -re -i videoA.mp4 -c copy -f mpegts udp://127.0.0.1:1234

ffmpeg -re -i videoB.mp4 -c copy -f mpegts udp://127.0.0.1:1234