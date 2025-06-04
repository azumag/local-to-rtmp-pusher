# UDP配信システム設計書

## 概要

FFmpegとUDPストリームを使用した動的動画切り替え配信システムの設計書です。RTMPセッションを維持しながら、ユーザが選択した動画ファイルを途切れなく配信することが可能です。

## システム要求

### 機能要求
- 初期動画（動画A）の配信開始
- 配信セッションを維持したまま次の動画（動画B）への切り替え
- ユーザによる動的な動画選択
- 配信の中断なしでの連続再生

### 非機能要求
- レイテンシ: 50ms以下
- 切り替え時間: 1秒以下
- CPU使用率: 中程度
- メモリ使用量: 最小限

## システム構成

### アーキテクチャ図

```
Docker Compose Environment
┌─────────────────────────────────────────────────────────────────┐
│                        streaming-network                        │
│                                                                 │
│  ┌─────────────────┐    UDP:1234    ┌─────────────────┐         │
│  │  sender         │ ──────────────→ │  receiver       │         │
│  │  Container      │                 │  Container      │         │
│  │                 │                 │                 │         │
│  │ [動画ファイル]    │                 │ [UDP受信]       │ ────────┼─→ RTMP
│  │ [FFmpeg送信]    │                 │ [RTMP配信]      │         │   配信サーバー
│  │                 │                 │                 │         │
│  └─────────────────┘                 └─────────────────┘         │
│           ↑                                                     │
│  ┌─────────────────┐                                            │
│  │  controller     │                                            │
│  │  Container      │                                            │
│  │                 │                                            │
│  │ [制御スクリプト]  │                                            │
│  │ [ユーザUI]       │                                            │
│  │ [プロセス管理]    │                                            │
│  └─────────────────┘                                            │
│                                                                 │
│  Volumes:                                                       │
│  • videos:/app/videos (動画ファイル)                             │
│  • logs:/app/logs (ログファイル)                                 │
│  • config:/app/config (設定ファイル)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Dockerコンテナ構成

#### 1. receiver コンテナ（配信プロセス）
- **ベースイメージ**: `linuxserver/ffmpeg:latest`
- **役割**: UDP受信 → RTMP配信
- **ポート**: 1234/udp（内部通信）
- **永続化**: 配信セッション維持
- **リソース制限**: CPU 0.5コア、メモリ 512MB

#### 2. sender コンテナ（動画送信プロセス）
- **ベースイメージ**: `linuxserver/ffmpeg:latest`
- **役割**: 動画ファイル → UDP送信
- **ライフサイクル**: 動的作成・削除
- **ボリューム**: videos:/app/videos（読み取り専用）
- **リソース制限**: CPU 0.3コア、メモリ 256MB

#### 3. controller コンテナ（制御システム）
- **ベースイメージ**: `alpine:latest` + bash
- **役割**: ユーザ入力受付、コンテナ管理
- **Docker Socket**: `/var/run/docker.sock`（コンテナ操作用）
- **ボリューム**: 設定ファイル、ログファイル
- **ポート**: 8080（Web UI用）

### ネットワーク構成

#### streaming-network（カスタムブリッジ）
- **タイプ**: bridge
- **サブネット**: 172.20.0.0/16
- **IP割り当て**:
  - receiver: 172.20.0.10
  - sender: 172.20.0.11（動的）
  - controller: 172.20.0.12

## 技術仕様

### プロトコル仕様

| 項目 | 仕様 |
|------|------|
| **通信プロトコル** | UDP |
| **ポート番号** | 1234（設定可能） |
| **データ形式** | MPEG-TS |
| **配信プロトコル** | RTMP |
| **動画コーデック** | コピー（再エンコードなし） |
| **音声コーデック** | コピー（再エンコードなし） |

### FFmpegパラメータ

#### 受信側（配信プロセス）
```bash
ffmpeg -i udp://127.0.0.1:1234?timeout=0&buffer_size=65536 \
       -c copy \
       -f flv \
       rtmp://配信サーバー/live/ストリームキー
```

#### 送信側（動画プロセス）
```bash
ffmpeg -re \
       -i 動画ファイル \
       -c copy \
       -f mpegts \
       udp://127.0.0.1:1234
```

### パラメータ詳細

| パラメータ | 説明 | 設定値 |
|-----------|------|--------|
| `-re` | リアルタイム読み込み | 送信側のみ |
| `timeout=0` | タイムアウト無効 | 受信側 |
| `buffer_size` | UDPバッファサイズ | 65536バイト |
| `-c copy` | コーデックコピー | 両側 |
| `-f mpegts` | MPEG-TS形式 | 送信側 |
| `-f flv` | FLV形式（RTMP用） | 受信側 |

## 実装仕様

### Docker Compose構成

#### docker-compose.yml

```yaml
version: '3.8'

services:
  receiver:
    image: linuxserver/ffmpeg:latest
    container_name: streaming-receiver
    hostname: receiver
    networks:
      streaming-network:
        ipv4_address: 172.20.0.10
    ports:
      - "1234:1234/udp"
    volumes:
      - logs:/app/logs
      - config:/app/config
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Asia/Tokyo
    command: >
      sh -c "ffmpeg -i udp://0.0.0.0:1234?timeout=0&buffer_size=65536 
             -c copy -f flv rtmp://$RTMP_SERVER/$STREAM_KEY 
             -loglevel info -report"
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 256M

  controller:
    build:
      context: .
      dockerfile: Dockerfile.controller
    container_name: streaming-controller
    hostname: controller
    networks:
      - streaming-network
    ports:
      - "8080:8080"
    volumes:
      - videos:/app/videos:ro
      - logs:/app/logs
      - config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_API_VERSION=1.41
      - UDP_TARGET=172.20.0.10:1234
    depends_on:
      - receiver
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.3'
          memory: 256M

volumes:
  videos:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./videos
  logs:
    driver: local
  config:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./config

networks:
  streaming-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

#### Dockerfile.controller

```dockerfile
FROM alpine:latest

# 必要パッケージのインストール
RUN apk add --no-cache \
    bash \
    curl \
    docker-cli \
    ffmpeg \
    python3 \
    py3-pip \
    py3-flask

# 作業ディレクトリ設定
WORKDIR /app

# アプリケーションファイルをコピー
COPY controller/ ./
COPY scripts/ ./scripts/

# 実行権限付与
RUN chmod +x scripts/*.sh

# ポート公開
EXPOSE 8080

# 起動コマンド
CMD ["python3", "controller.py"]
```

### ディレクトリ構造

```
streaming_system/
├── docker-compose.yml
├── Dockerfile.controller
├── .env                       # 環境変数設定
├── controller/
│   ├── controller.py         # Flask Web UI
│   ├── docker_manager.py     # Docker操作ライブラリ
│   └── templates/
│       └── index.html        # Web UI
├── scripts/
│   ├── start_sender.sh       # sender起動スクリプト
│   ├── stop_sender.sh        # sender停止スクリプト
│   └── health_check.sh       # ヘルスチェック
├── config/
│   ├── stream.conf          # 配信設定
│   └── docker.conf          # Docker設定
├── videos/                  # 動画ファイル格納
└── logs/                    # ログファイル
```

### 環境変数設定（.env）

```bash
# RTMP設定
RTMP_SERVER=rtmp://配信サーバー/live/
STREAM_KEY=your_stream_key

# Docker設定
COMPOSE_PROJECT_NAME=streaming
DOCKER_BUILDKIT=1

# UDP設定
UDP_PORT=1234
UDP_HOST=172.20.0.10

# ログ設定
LOG_LEVEL=info
TZ=Asia/Tokyo

# リソース制限
RECEIVER_CPU_LIMIT=0.5
RECEIVER_MEMORY_LIMIT=512m
CONTROLLER_CPU_LIMIT=0.3
CONTROLLER_MEMORY_LIMIT=256m
```

## エラーハンドリング

### 想定エラーと対処

| エラー種別 | 原因 | 対処方法 |
|-----------|------|----------|
| **UDP送信失敗** | ポート占有、権限不足 | ポート変更、権限確認 |
| **動画ファイル読み込み失敗** | ファイル不存在、破損 | ファイル存在確認、スキップ |
| **RTMP接続失敗** | ネットワーク、認証エラー | 再接続、設定確認 |
| **プロセス異常終了** | メモリ不足、システムエラー | プロセス再起動 |

### 復旧メカニズム

```bash
# プロセス監視
check_stream_process() {
    if ! kill -0 $STREAM_PID 2>/dev/null; then
        echo "配信プロセス異常終了を検出"
        restart_stream_process
    fi
}

# 自動復旧
restart_stream_process() {
    echo "配信プロセスを再起動中..."
    start_stream_receiver
    sleep 2
    resume_video_sending
}
```

## パフォーマンス仕様

### リソース使用量

| リソース | 想定値 | 最大値 |
|----------|--------|--------|
| **CPU使用率** | 5-15% | 25% |
| **メモリ使用量** | 50-100MB | 200MB |
| **ネットワーク帯域** | 動画ビットレート相当 | 1.5倍 |
| **ディスク使用量** | ログファイルのみ | 100MB |

### レイテンシ仕様

| 処理 | 目標時間 | 最大許容時間 |
|------|----------|-------------|
| **動画切り替え** | 0.5秒 | 1秒 |
| **UDP転送遅延** | 10ms | 50ms |
| **プロセス起動** | 1秒 | 3秒 |

## 運用仕様

### 起動方法

```bash
# システム起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 特定サービスのログ確認
docker-compose logs -f receiver
docker-compose logs -f controller

# 設定ファイル指定起動
docker-compose --env-file .env.production up -d
```

### Web UI操作

```
ブラウザでアクセス: http://localhost:8080

操作画面:
┌─────────────────────────────────────┐
│ 配信システム制御画面                  │
├─────────────────────────────────────┤
│ 配信状況: ● 配信中                   │
│ 現在の動画: videoA.mp4               │
│                                     │
│ 利用可能な動画:                      │
│ ○ videoA.mp4                       │
│ ○ videoB.mp4                       │
│ ○ videoC.mp4                       │
│                                     │
│ [動画切り替え] [配信停止] [ログ表示]   │
└─────────────────────────────────────┘
```

### コマンドライン操作

```bash
# 動画切り替え（API経由）
curl -X POST http://localhost:8080/api/switch \
     -H "Content-Type: application/json" \
     -d '{"video": "videoB.mp4"}'

# 配信状況確認
curl http://localhost:8080/api/status

# 利用可能動画一覧
curl http://localhost:8080/api/videos
```

### Docker操作

```bash
# コンテナ状況確認
docker-compose ps

# senderコンテナの動的確認
docker ps --filter "name=streaming-sender"

# receiverコンテナの再起動
docker-compose restart receiver

# システム完全停止
docker-compose down

# ボリューム含む完全削除
docker-compose down -v
```

### ログ出力

```bash
# ログレベル
2024-06-04 10:00:01 [INFO] 配信プロセス開始 PID:1234
2024-06-04 10:00:02 [INFO] UDP受信開始 127.0.0.1:1234
2024-06-04 10:00:03 [INFO] RTMP配信開始 rtmp://server/live/key
2024-06-04 10:01:00 [INFO] 動画切り替え videoA.mp4 → videoB.mp4
2024-06-04 10:01:01 [WARN] UDP送信遅延検出 100ms
2024-06-04 10:02:00 [ERROR] 動画ファイル読み込み失敗 videoC.mp4
```

## セキュリティ仕様

### アクセス制御

- UDPポートはローカルホストのみ（127.0.0.1）
- 動画ファイルは指定ディレクトリ内に制限
- RTMP認証情報は設定ファイルで管理

### 入力検証

```bash
# ファイル存在確認
validate_video_file() {
    local file="$1"
    if [[ ! -f "$VIDEO_DIR/$file" ]]; then
        echo "エラー: ファイルが存在しません"
        return 1
    fi
}

# パス検証（ディレクトリトラバーサル対策）
validate_file_path() {
    local file="$1"
    case "$file" in
        *..* | /*) echo "無効なパス"; return 1 ;;
    esac
}
```

## 拡張仕様

### 拡張仕様

#### マルチ配信対応

```yaml
# docker-compose.multi.yml
version: '3.8'

services:
  receiver-youtube:
    extends:
      file: docker-compose.yml
      service: receiver
    container_name: streaming-receiver-youtube
    networks:
      streaming-network:
        ipv4_address: 172.20.0.20
    environment:
      - RTMP_SERVER=rtmp://a.rtmp.youtube.com/live2/
      - STREAM_KEY=${YOUTUBE_STREAM_KEY}

  receiver-twitch:
    extends:
      file: docker-compose.yml
      service: receiver
    container_name: streaming-receiver-twitch
    networks:
      streaming-network:
        ipv4_address: 172.20.0.21
    environment:
      - RTMP_SERVER=rtmp://live.twitch.tv/live/
      - STREAM_KEY=${TWITCH_STREAM_KEY}

  load-balancer:
    image: nginx:alpine
    container_name: streaming-lb
    networks:
      - streaming-network
    ports:
      - "1234:1234/udp"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - receiver-youtube
      - receiver-twitch
```

#### 配信品質監視

```python
# monitoring.py（controllerに統合）
import psutil
import docker

class StreamMonitor:
    def __init__(self):
        self.client = docker.from_env()
    
    def get_container_stats(self, container_name):
        """コンテナリソース使用量取得"""
        try:
            container = self.client.containers.get(container_name)
            stats = container.stats(stream=False)
            
            # CPU使用率計算
            cpu_percent = self.calculate_cpu_percent(stats)
            
            # メモリ使用量
            memory_usage = stats['memory_stats']['usage']
            memory_limit = stats['memory_stats']['limit']
            memory_percent = (memory_usage / memory_limit) * 100
            
            return {
                "cpu_percent": round(cpu_percent, 2),
                "memory_percent": round(memory_percent, 2),
                "memory_usage_mb": round(memory_usage / 1024 / 1024, 2),
                "status": container.status
            }
        except Exception as e:
            return {"error": str(e)}
    
    def calculate_cpu_percent(self, stats):
        """CPU使用率計算"""
        cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                   stats['precpu_stats']['cpu_usage']['total_usage']
        system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                      stats['precpu_stats']['system_cpu_usage']
        
        if system_delta > 0:
            return (cpu_delta / system_delta) * len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100
        return 0.0
    
    def check_stream_health(self):
        """配信ヘルスチェック"""
        receiver_stats = self.get_container_stats("streaming-receiver")
        
        # しきい値チェック
        alerts = []
        if receiver_stats.get("cpu_percent", 0) > 80:
            alerts.append("CPU使用率が高すぎます")
        if receiver_stats.get("memory_percent", 0) > 90:
            alerts.append("メモリ使用率が高すぎます")
        
        return {
            "stats": receiver_stats,
            "alerts": alerts,
            "timestamp": datetime.now().isoformat()
        }
```

#### プレイリスト機能

```python
# playlist.py
import json
import random
from datetime import datetime

class PlaylistManager:
    def __init__(self, playlist_file="playlists.json"):
        self.playlist_file = playlist_file
        self.playlists = self.load_playlists()
    
    def load_playlists(self):
        """プレイリスト読み込み"""
        try:
            with open(self.playlist_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {"default": []}
    
    def save_playlists(self):
        """プレイリスト保存"""
        with open(self.playlist_file, 'w') as f:
            json.dump(self.playlists, f, indent=2)
    
    def create_playlist(self, name, videos):
        """プレイリスト作成"""
        self.playlists[name] = {
            "videos": videos,
            "created": datetime.now().isoformat(),
            "current_index": 0
        }
        self.save_playlists()
    
    def get_next_video(self, playlist_name, shuffle=False):
        """次の動画取得"""
        if playlist_name not in self.playlists:
            return None
        
        playlist = self.playlists[playlist_name]
        videos = playlist["videos"]
        
        if shuffle:
            return random.choice(videos)
        
        current_index = playlist["current_index"]
        if current_index >= len(videos):
            current_index = 0
        
        video = videos[current_index]
        playlist["current_index"] = current_index + 1
        self.save_playlists()
        
        return video
```

### 将来の拡張予定

- 複数RTMPエンドポイントへの配信
- エンドポイントごとにビットレートなどの配信設定

## まとめ

本設計により、UDPストリームを活用した安定性の高い動的動画配信システムを実現できます。シンプルな構成でありながら、拡張性と保守性を両立した設計となっています。