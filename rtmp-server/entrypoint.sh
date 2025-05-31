#!/bin/sh

echo "Starting RTMP server..."

# Check if we're in a minimal CI environment where backend might not be available
if [ "$CI_MODE" = "true" ]; then
  echo "CI mode detected, creating nginx config without backend callbacks"
  
  # Create a CI-specific nginx config without backend callbacks
  cat > /etc/nginx/nginx.conf << 'EOF'
# Load the RTMP module
load_module modules/ngx_rtmp_module.so;

worker_processes auto;

events {
    worker_connections 1024;
}

rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        application live {
            live on;
            record off;
            
            # RTMPのpull/pushを許可
            allow publish all;
            allow play all;
            
            # セッション管理の改善
            drop_idle_publisher 10s;
            sync 10ms;
            wait_key on;
            wait_video on;
            publish_notify on;
            play_restart on;
            
            # RTMPプッシュの設定
            push_reconnect 1s;
            
            # HLS設定
            hls on;
            hls_path /opt/rtmp/data/hls;
            hls_fragment 3;
            hls_playlist_length 60;
            
            # DASH設定
            dash on;
            dash_path /opt/rtmp/data/dash;
            dash_fragment 3;
            dash_playlist_length 60;
        }
    }
}

http {
    include mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    
    server {
        listen 8000;
        
        # CORS設定
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS';
        
        # HLSのファイル配信
        location /hls {
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }
            root /opt/rtmp/data;
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
        }
        
        # DASHのファイル配信
        location /dash {
            types {
                application/dash+xml mpd;
                video/mp4 mp4;
            }
            root /opt/rtmp/data;
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
        }

        # サーバーのステータス確認用
        location /stat {
            rtmp_stat all;
            rtmp_stat_stylesheet stat.xsl;
        }
        
        location /stat.xsl {
            root /opt/rtmp/data;
        }
        
        # シンプルなステータスページ
        location / {
            root /opt/rtmp/data;
            index index.html;
        }
    }
}
EOF
  
  echo "CI nginx config created, starting nginx..."
  exec nginx -g "daemon off;"
fi

# Wait for backend to be available (optional, with timeout)
if [ -n "$BACKEND_HOST" ]; then
  echo "Waiting for backend at $BACKEND_HOST..."
  timeout=60
  elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    if wget --no-verbose --tries=1 --spider --timeout=5 "http://$BACKEND_HOST/api/health" 2>/dev/null; then
      echo "Backend is available!"
      break
    fi
    
    echo "Backend not ready, waiting... ($elapsed/$timeout seconds)"
    sleep 5
    elapsed=$((elapsed + 5))
  done
  
  if [ $elapsed -ge $timeout ]; then
    echo "Warning: Backend not available after $timeout seconds, starting anyway..."
  fi
fi

# Start nginx
echo "Starting nginx..."
exec nginx -g "daemon off;"