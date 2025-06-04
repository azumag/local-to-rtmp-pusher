# UDP配信システム (Local-to-RTMP Pusher)

動的動画切り替え可能なUDP→RTMP配信システム

## 🚀 クイックスタート

### 1. システム起動
```bash
# 全サービス起動（ローカルRTMPサーバー含む）
docker-compose up -d

# ログ確認
docker-compose logs -f
```

### 2. Web UI アクセス
- 制御画面: http://localhost:8080
- RTMP統計: http://localhost:8081/stat

### 3. 動画ファイル準備
```bash
# videos/ディレクトリに動画ファイルを配置
cp your-video.mp4 videos/
```

### 4. 配信開始
1. Web UIで動画ファイルを選択
2. 「選択」ボタンをクリック
3. 配信状況を確認

## 📁 システム構成

```
UDP配信システム
├── rtmp-server/          # ローカルRTMPサーバー
├── controller/           # Web UI + API
├── scripts/             # 運用スクリプト
├── config/              # 設定ファイル
├── videos/              # 動画ファイル
└── logs/                # ログファイル
```

## 🔧 設定

### ローカルテスト（デフォルト）
```bash
# .env の設定
RTMP_SERVER=rtmp://rtmp-server:1935/live
STREAM_KEY=test-stream
```

### 外部配信（Twitch等）
```bash
# .env を編集
RTMP_SERVER=rtmp://live.twitch.tv/live
STREAM_KEY=your_actual_stream_key

# 本番環境で起動
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 🎮 配信視聴

### VLCで視聴
1. VLC を開く
2. `Media` > `Open Network Stream`
3. URL: `rtmp://localhost:1935/live/test-stream`
4. `Play` をクリック

### FFplayで視聴
```bash
ffplay rtmp://localhost:1935/live/test-stream
```

## 📊 監視・メンテナンス

### ヘルスチェック
```bash
# システム状態確認
./scripts/health_check.sh

# 連続監視
./scripts/health_check.sh --watch
```

### ログ確認
```bash
# 全ログ
docker-compose logs

# 特定サービス
docker-compose logs receiver
docker-compose logs rtmp-server
```

### 手動操作
```bash
# Sender起動
./scripts/start_sender.sh video.mp4

# Sender停止
./scripts/stop_sender.sh

# 全Sender停止
./scripts/stop_sender.sh --all
```

## 🛠️ トラブルシューティング

### よくある問題

**1. 動画が再生されない**
```bash
# コンテナ状態確認
docker-compose ps

# ネットワーク確認
docker network ls | grep streaming
```

**2. Web UIにアクセスできない**
```bash
# ポート確認
netstat -tlnp | grep 8080

# コントローラーログ確認
docker-compose logs controller
```

**3. RTMPストリームが開始されない**
```bash
# RTMPサーバー状態確認
curl http://localhost:8081/stat

# Receiverログ確認
docker-compose logs receiver
```

### リセット方法
```bash
# 全停止・削除
docker-compose down -v

# イメージ再ビルド
docker-compose build --no-cache

# クリーン起動
docker-compose up -d
```

## 📈 パフォーマンス

### 推奨スペック
- CPU: 2コア以上
- メモリ: 2GB以上
- ディスク: 10GB以上の空き容量

### リソース使用量
- Receiver: CPU 5-15%, メモリ 50-100MB
- Controller: CPU 2-5%, メモリ 50MB
- RTMP Server: CPU 2-5%, メモリ 50MB

## 🔒 セキュリティ

### 本番環境での注意点
1. RTMPストリームキーを適切に管理
2. Web UIにアクセス制限を設定
3. ファイアウォール設定を確認
4. ログローテーションを設定

## 📚 API リファレンス

### REST API
- `GET /api/status` - システム状況取得
- `GET /api/videos` - 動画一覧取得
- `POST /api/switch` - 動画切り替え
- `POST /api/stop` - 配信停止
- `GET /api/health` - ヘルスチェック
- `GET /api/logs` - ログ取得

### 使用例
```bash
# 動画切り替え
curl -X POST http://localhost:8080/api/switch \
     -H "Content-Type: application/json" \
     -d '{"video": "test-video.mp4"}'

# ステータス確認
curl http://localhost:8080/api/status
```

## 📄 ライセンス

本プロジェクトは実証目的で作成されており、本番環境での使用には追加の考慮が必要です。