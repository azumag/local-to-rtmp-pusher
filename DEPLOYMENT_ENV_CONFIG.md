# デプロイ時環境変数設定ガイド

## 概要

AWS Lightsailでのデプロイ時に環境変数を自動設定する方法について説明します。

## 設定方法

### 1. Terraform Variables での設定

#### 基本的な環境変数

**terraform.tfvars** ファイルで設定：

```hcl
# 基本設定
environment = "prod"
project_name = "streamcaster"
log_level = "info"

# RTMP配信設定
rtmp_server = "rtmp://live.twitch.tv/live"
stream_key = "your_stream_key_here"  # 機密情報

# リポジトリ設定
repository_url = "https://github.com/azumag/local-to-rtmp-pusher.git"
deployment_branch = "development"

# Google Drive連携（オプション）
google_drive_api_key = "your_api_key_here"
google_client_id = "your_client_id_here"
google_client_secret = "your_client_secret_here"
google_refresh_token = "your_refresh_token_here"
```

#### 機密情報の設定方法

**方法1: 環境変数で設定**
```bash
export TF_VAR_stream_key="your_actual_stream_key"
export TF_VAR_google_client_secret="your_secret"
terraform apply
```

**方法2: tfvarsファイルで設定**
```bash
# terraform.tfvars.secret ファイルを作成（.gitignoreに追加済み）
echo 'stream_key = "your_stream_key"' > terraform.tfvars.secret
terraform apply -var-file="terraform.tfvars.secret"
```

### 2. デプロイ時の自動設定

#### User-Dataスクリプトによる.env作成

Terraformでデプロイ時、以下が自動実行されます：

1. **`.env`ファイルの自動作成**
   - `/home/ubuntu/streamcaster/.env` に配置
   - Docker Composeが自動読み込み

2. **バックアップファイル作成**
   - `.env.production` にも同内容をコピー

3. **環境変数の内容例**
```env
# StreamCaster Production Configuration
NODE_ENV=production
LOG_LEVEL=info
TZ=Asia/Tokyo

# Network
HTTP_PORT=8080
RTMP_PORT=1935
STATS_PORT=8081
UDP_PORT=1234

# RTMP設定（terraform.tfvarsから自動設定）
RTMP_SERVER=rtmp://live.twitch.tv/live
STREAM_KEY=your_stream_key_here

# Google Drive（terraform.tfvarsから自動設定）
GOOGLE_DRIVE_API_KEY=your_api_key_here
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REFRESH_TOKEN=your_refresh_token_here

# リソース制限（nano instance最適化）
CONTROLLER_CPU_LIMIT=0.2
CONTROLLER_MEMORY_LIMIT=128M
RECEIVER_CPU_LIMIT=0.3
RECEIVER_MEMORY_LIMIT=256M
```

### 3. 実運用での設定手順

#### 初回デプロイ

```bash
# 1. 機密情報を環境変数で設定
export TF_VAR_stream_key="your_twitch_stream_key"
export TF_VAR_google_client_secret="your_google_secret"

# 2. terraform.tfvarsでその他設定
cat > terraform.tfvars << EOF
environment = "prod"
rtmp_server = "rtmp://live.twitch.tv/live"
deployment_branch = "main"  # 本番用ブランチ
log_level = "warn"  # 本番では警告レベル以上のみ
EOF

# 3. デプロイ実行
cd terraform
terraform plan
terraform apply
```

#### 設定変更時

**新しいインスタンス作成（推奨）**
```bash
# 設定変更後、新しいインスタンスを作成
terraform apply
```

**既存インスタンスでの手動更新**
```bash
# 緊急時のみ：SSHで直接設定変更
ssh -i ~/.ssh/streamcaster-lightsail ubuntu@54.199.47.67

# .envファイルを編集
cd ~/streamcaster
nano .env

# サービス再起動
docker-compose down
docker-compose up -d
```

### 4. セキュリティ対策

#### 機密情報の管理

1. **terraform.tfvarsをgitから除外**
```bash
# .gitignore に追加済み
terraform/terraform.tfvars
terraform/*.tfvars.secret
```

2. **環境変数での機密情報設定**
```bash
# CI/CDでの設定例
export TF_VAR_stream_key="${TWITCH_STREAM_KEY}"
export TF_VAR_google_client_secret="${GOOGLE_CLIENT_SECRET}"
```

3. **AWS Parameter Storeとの連携（将来的）**
```hcl
# main.tf での設定例（将来実装予定）
data "aws_ssm_parameter" "stream_key" {
  name = "/streamcaster/stream_key"
}
```

### 5. トラブルシューティング

#### 環境変数が設定されない場合

**確認コマンド：**
```bash
# SSHでインスタンスに接続
ssh -i ~/.ssh/streamcaster-lightsail ubuntu@54.199.47.67

# .envファイルの確認
cat ~/streamcaster/.env

# Docker内での環境変数確認
docker exec streaming-controller env | grep RTMP_SERVER

# ログの確認
docker logs streaming-controller 2>&1 | grep -i "variable.*not set"
```

**解決方法：**
```bash
# 1. .envファイルの再作成
cd ~/streamcaster
cp .env.production .env

# 2. サービス再起動
docker-compose down
docker-compose up -d

# 3. 確認
docker logs streaming-controller
```

## まとめ

✅ **Terraform変数でのプロビジョニング時設定**
✅ **自動的な.envファイル作成**  
✅ **Docker Composeでの自動読み込み**
✅ **機密情報の安全な管理**

この設定により、デプロイ時に環境変数が自動的に設定され、"variable is not set"エラーが解消されます。