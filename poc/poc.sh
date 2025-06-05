# 1つのFFmpegでUDP受信→RTMP配信
ffmpeg -fflags +genpts+discardcorrupt+igndts -avoid_negative_ts make_zero \
-use_wallclock_as_timestamps 1 \
-i "udp://127.0.0.1:1234?timeout=0&buffer_size=65536&fifo_size=1000000&overrun_nonfatal=1&reuse=1" -c copy \
-fps_mode passthrough -async 1 \
-max_muxing_queue_size 1024 \
-f flv rtmp://localhost:1935/live/stream


# 動画を順次UDP送信（別プロセス）
ffmpeg -re -stream_loop -1 -i ./videos/main-content.mp4 \
       -avoid_negative_ts make_zero \
       -fflags +genpts \
       -muxdelay 0 -muxpreload 0 \
       -c copy -f mpegts \
       -mpegts_start_pid 256 \
       -buffer_size 131072 \
       udp://127.0.0.1:1234

# ただし同時に実行はできない、必ず一方を終了してからバッファが終わるまでに次のプロセスを実行せねばならない
ffmpeg -re -stream_loop -1 -i ./videos/standby.mp4 \
       -avoid_negative_ts make_zero \
       -fflags +genpts \
       -muxdelay 0 -muxpreload 0 \
       -c copy -f mpegts \
       -mpegts_start_pid 256 \
       -buffer_size 131072 \
       udp://127.0.0.1:1234

# 2500kに制限、vrcdnなどのRTMP配信に近い設定
# ffmpeg -re -stream_loop -1 -i ./videos/standby.mp4 \
ffmpeg -i "udp://127.0.0.1:1234?timeout=0" \
  -c:v libx264 -preset veryfast \
  -b:v 2500k -maxrate 2500k -bufsize 5000k \
  -c:a aac -b:a 128k \
  -f flv rtmp://xxxxxxxx