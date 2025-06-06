# AWS Lightsail デプロイメント計画書

## 📋 概要

StreamCasterシステムをAWS Lightsailで運用するための包括的なデプロイメント計画書です。

### プロジェクト詳細
- **プロジェクト名**: StreamCaster
- **システム種別**: UDP-to-RTMP 動的動画配信システム
- **作成日**: 2025年6月6日
- **対象環境**: AWS Lightsail 本番環境

## 🎯 推奨構成

### 基本仕様
| 項目 | 仕様 | 備考 |
|------|------|------|
| **サービス** | AWS Lightsail 仮想インスタンス | Container Serviceではなくインスタンス |
| **プラン** | $5/月 Linux/Unix | nano_2_0 bundle |
| **CPU** | 1コア | バーストパフォーマンス |
| **RAM** | 1GB | 使用予想: ~900MB |
| **SSD** | 40GB | システム + アプリケーション |
| **転送量** | 2TB/月 | 超過時 $0.09/GB |
| **OS** | Ubuntu 20.04 LTS | 推奨OS |

### コスト試算
- **基本料金**: $5/月
- **静的IP**: $0（アタッチ時無料）
- **想定月額**: $5-7/月（転送量込み）

## 🏗️ アーキテクチャ構成

### システム構成図
```
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Lightsail Instance                      │
│                         ($5/月)                                │
├─────────────────────────────────────────────────────────────────┤
│  外部アクセス:                                                    │
│  • http://STATIC_IP:8080  (Web Control Panel)                 │
│  • rtmp://STATIC_IP:1935/live/stream  (RTMP Pull)             │
│  • http://STATIC_IP:8081/stat  (RTMP Stats)                   │
├─────────────────────────────────────────────────────────────────┤
│                     Docker Compose                             │
│  ┌─────────────────┐    UDP:1234    ┌─────────────────┐         │
│  │  Controller     │ ──────────────→ │  Receiver       │         │
│  │  (Web UI/API)   │                 │  (UDP→RTMP)     │         │
│  │  :8080          │                 │  :1234/udp      │         │
│  └─────────────────┘                 └─────────────────┘         │
│           ↓                                   ↓                 │
│  ┌─────────────────┐                 ┌─────────────────┐         │
│  │  Sender         │                 │  RTMP Server    │         │
│  │  (動的作成)      │                 │  :1935, :8081   │         │
│  │  FFmpeg Process │                 │  (Nginx RTMP)   │         │
│  └─────────────────┘                 └─────────────────┘         │
│                                                                 │
│  Volumes: videos/, logs/, config/                              │
└─────────────────────────────────────────────────────────────────┘
```

### ネットワーク構成
| ポート | プロトコル | 用途 | 外部公開 |
|--------|------------|------|----------|
| 8080 | TCP | Web Control Panel | ✅ |
| 1935 | TCP | RTMP Pull Endpoint | ✅ |
| 8081 | TCP | RTMP Stats/Monitoring | ✅ |
| 1234 | UDP | 内部UDP通信 | ❌ |

## 🚀 デプロイメント手順

### Phase 1: インフラ構築

#### 1.1 Lightsailインスタンス作成
```bash
# AWS CLI でのインスタンス作成
aws lightsail create-instances \
  --instance-names "streamcaster-prod" \
  --availability-zone "ap-northeast-1a" \
  --blueprint-id "ubuntu_20_04" \
  --bundle-id "nano_2_0"

# 静的IP割り当て
aws lightsail allocate-static-ip \
  --static-ip-name "streamcaster-static-ip"

aws lightsail attach-static-ip \
  --static-ip-name "streamcaster-static-ip" \
  --instance-name "streamcaster-prod"
```

#### 1.2 ファイアウォール設定
```bash
# Webコントロールページ（特定IPのみ推奨）
aws lightsail open-instance-public-ports \
  --instance-name "streamcaster-prod" \
  --port-info fromPort=8080,toPort=8080,protocol=TCP,cidrs="YOUR_ADMIN_IP/32"

# RTMPプル（全世界からアクセス可能）
aws lightsail open-instance-public-ports \
  --instance-name "streamcaster-prod" \
  --port-info fromPort=1935,toPort=1935,protocol=TCP,cidrs="0.0.0.0/0"

# RTMP統計（オプション）
aws lightsail open-instance-public-ports \
  --instance-name "streamcaster-prod" \
  --port-info fromPort=8081,toPort=8081,protocol=TCP,cidrs="0.0.0.0/0"
```

### Phase 2: サーバー環境構築

#### 2.1 基本パッケージインストール
```bash
# SSHでインスタンスに接続
ssh -i LightsailDefaultKey-ap-northeast-1.pem ubuntu@YOUR_STATIC_IP

# システムアップデート
sudo apt update && sudo apt upgrade -y

# 必要パッケージインストール
sudo apt install -y git curl wget unzip
```

#### 2.2 Docker環境セットアップ
```bash
# Dockerインストール
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Docker Composeインストール
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 再ログインでDockerグループ反映
exit
```

### Phase 3: アプリケーションデプロイ

#### 3.1 アプリケーション配置
```bash
# リポジトリクローン
cd /home/ubuntu
git clone https://github.com/your-username/local-to-rtmp-pusher.git streamcaster
cd streamcaster

# ディレクトリ準備
mkdir -p videos logs
sudo chown -R ubuntu:ubuntu videos logs
```

#### 3.2 環境設定
```bash
# 本番環境設定ファイル作成
cp .env.example .env.production

# 設定編集（以下は例）
cat > .env.production << 'EOF'
# RTMP設定（外部配信先）
RTMP_SERVER=rtmp://live.twitch.tv/live
STREAM_KEY=your_stream_key_here

# ネットワーク設定
UDP_HOST=172.20.0.10
UDP_PORT=1234
HTTP_PORT=8080
RTMP_PORT=1935

# リソース制限
CONTROLLER_CPU_LIMIT=0.3
RECEIVER_CPU_LIMIT=0.5
CONTROLLER_MEMORY_LIMIT=256M
RECEIVER_MEMORY_LIMIT=512M

# ログ設定
LOG_LEVEL=info
TZ=Asia/Tokyo

# Google Drive設定（オプション）
GOOGLE_DRIVE_API_KEY=your_api_key_here
EOF
```

#### 3.3 アプリケーション起動
```bash
# 本番環境での起動
docker-compose --env-file .env.production up -d

# 状態確認
docker-compose ps
docker-compose logs -f

# 初回動作確認
curl http://localhost:8080/api/health
```

## 📊 リソース配分計画

### コンテナリソース使用量
| コンテナ | CPU制限 | RAM制限 | 実際使用予想 | 備考 |
|----------|---------|---------|--------------|------|
| controller | 0.3コア | 256MB | ~200MB | Web UI + API |
| receiver | 0.5コア | 512MB | ~400MB | UDP → RTMP変換 |
| relay | 0.2コア | 128MB | ~100MB | 動画切り替え |
| rtmp-server | 0.3コア | 256MB | ~200MB | ローカルRTMPサーバー |
| **合計** | **1.3コア** | **1.15GB** | **~900MB** | **安全マージン: 15%** |

### ストレージ使用量
- **システム**: ~5GB
- **Docker**: ~10GB
- **アプリケーション**: ~2GB
- **ログ**: ~1GB
- **動画ファイル**: ~20GB
- **予備**: ~2GB
- **合計**: ~40GB（プラン内）

## 🔒 セキュリティ設定

### ファイアウォール戦略
```bash
# 推奨セキュリティ設定

# 1. SSH（デフォルトで22番ポートが開いている）
# 必要に応じてIP制限を追加
aws lightsail put-instance-public-ports \
  --instance-name "streamcaster-prod" \
  --port-infos '[
    {
      "fromPort": 22,
      "toPort": 22,
      "protocol": "tcp",
      "cidrs": ["YOUR_ADMIN_IP/32"]
    }
  ]'

# 2. Webコントロールパネル（管理者のみ）
# 管理者IPのみアクセス可能に制限

# 3. RTMP（パブリック）
# 配信プラットフォームからのアクセス用
```

### アクセス制御
- **SSH**: キーベース認証のみ
- **Web UI**: 必要に応じてBasic認証追加
- **RTMP**: ストリームキーによる認証

### 定期バックアップ
```bash
# Lightsailスナップショット作成（週次）
aws lightsail create-instance-snapshot \
  --instance-name "streamcaster-prod" \
  --instance-snapshot-name "streamcaster-backup-$(date +%Y%m%d)"

# 設定ファイルバックアップ
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
  .env.production docker-compose.yml config/
```

## 📈 監視・運用計画

### ヘルスチェック項目
| 項目 | 監視方法 | しきい値 | アクション |
|------|----------|----------|------------|
| CPU使用率 | CloudWatch | >80% | アラート |
| メモリ使用率 | アプリ内監視 | >90% | プロセス再起動 |
| ディスク使用量 | システム監視 | >80% | ログローテーション |
| RTMP接続状態 | アプリ内ヘルスチェック | 異常時 | 自動復旧 |
| Web UI応答 | 外部監視 | 5xx系エラー | アラート |

### 運用コマンド
```bash
# 日常運用
docker-compose logs -f                    # ログ確認
docker-compose restart receiver           # サービス再起動
docker-compose ps                         # 状態確認
docker system prune -f                    # 不要リソース削除

# トラブルシューティング
./scripts/health_check.sh                 # ヘルスチェック実行
docker stats                              # リソース使用量確認
sudo netstat -tlnp                        # ポート使用状況確認

# メンテナンス
docker-compose down                       # 全停止
docker-compose pull                       # イメージ更新
docker-compose up -d --build              # 再ビルド起動
```

### ログ管理
```bash
# ログローテーション設定
sudo tee /etc/logrotate.d/streamcaster << 'EOF'
/home/ubuntu/streamcaster/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    copytruncate
    create 644 ubuntu ubuntu
}
EOF
```

## 🔄 スケーリング戦略

### Phase 1: 現状維持（$5/月）
- **対象**: 開発・テスト・小規模運用
- **同時接続**: ~10セッション
- **想定負荷**: 軽〜中程度

### Phase 2: インスタンスアップグレード（$10/月）
```bash
# アップグレード時の手順
aws lightsail create-instance-snapshot \
  --instance-name "streamcaster-prod" \
  --instance-snapshot-name "before-upgrade"

# より大きなプランに移行
# 2GB RAM, 1コア, 60GB SSD
```

### Phase 3: 複数インスタンス構成（$15-20/月）
- **構成**: ロードバランサー + 複数インスタンス
- **用途**: 高可用性が必要な場合
- **実装**: Lightsail Load Balancer使用

### Phase 4: ECS移行（$20+/月）
- **構成**: AWS ECS + ALB
- **用途**: 本格的なスケーリングが必要な場合
- **実装**: 既存Docker構成を活用

## 🚨 障害対応計画

### 想定障害と対応

#### 1. インスタンス障害
```bash
# 対応手順
1. スナップショットから新インスタンス作成
2. 静的IPを新インスタンスに移行
3. 設定ファイル復元
4. アプリケーション再起動
```

#### 2. アプリケーション障害
```bash
# 自動復旧
./scripts/health_check.sh --auto-restart

# 手動復旧
docker-compose down
docker-compose up -d
```

#### 3. ストレージ不足
```bash
# 緊急対応
docker system prune -af              # 不要ファイル削除
rm -rf logs/*.log.gz                 # 古いログ削除

# 恒久対応
# より大きなプランにアップグレード
```

## 📋 デプロイメントチェックリスト

### 事前準備
- [ ] AWS アカウント設定完了
- [ ] Lightsail利用リージョン決定
- [ ] 静的IP取得準備
- [ ] ドメイン設定（オプション）

### インフラ構築
- [ ] Lightsailインスタンス作成
- [ ] 静的IP割り当て
- [ ] ファイアウォール設定
- [ ] SSH接続確認

### アプリケーション設定
- [ ] Docker環境構築
- [ ] アプリケーションクローン
- [ ] 環境変数設定
- [ ] 初期起動テスト

### 運用開始前確認
- [ ] Web UIアクセス確認
- [ ] RTMP接続テスト
- [ ] 動画切り替えテスト
- [ ] 外部配信テスト
- [ ] ログ出力確認
- [ ] バックアップ設定

### 運用開始後
- [ ] 監視設定
- [ ] 定期バックアップ
- [ ] ドキュメント更新
- [ ] 運用手順書作成

## 📞 サポート・連絡先

### トラブルシューティング
1. **アプリケーションログ確認**
   ```bash
   docker-compose logs -f
   ```

2. **AWS Lightsailサポート**
   - AWS Console > Support
   - 基本サポート（無料）利用可能

3. **システム監視**
   ```bash
   # リアルタイム監視
   watch -n 5 'docker stats --no-stream'
   ```

### 緊急時連絡手順
1. システム状態確認
2. 自動復旧試行
3. 手動復旧実施
4. 必要に応じてサポート連絡

---

**作成日**: 2025年6月6日  
**最終更新**: 2025年6月6日  
**バージョン**: 1.0  
**作成者**: Claude Code Assistant