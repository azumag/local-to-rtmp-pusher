# Terraform State Management Setup Guide

このガイドでは、StreamCasterプロジェクトでTerraformの状態をS3とDynamoDBで管理するためのセットアップ手順を説明します。

## 📋 概要

Terraformの状態管理をリモート化することで以下のメリットがあります：

- **チーム協作**: 複数人で同じインフラを安全に管理
- **CI/CD統合**: GitHub Actionsで自動デプロイ
- **状態の永続化**: ローカル環境に依存しない状態管理
- **ロック機能**: 同時実行による競合状態を防止
- **暗号化**: 状態ファイルの暗号化によるセキュリティ向上

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    State Management                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ S3 Bucket       │    │ DynamoDB Table                  │ │
│  │ - Versioning    │    │ - State Locking                 │ │
│  │ - Encryption    │    │ - Consistent Reads              │ │
│  │ - Lifecycle     │    │ - Point-in-time Recovery        │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ IAM Policies    │    │ GitHub Actions                  │ │
│  │ - State Access  │    │ - Automated Deployment          │ │
│  │ - Lightsail Ops │    │ - Multi-Environment             │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 セットアップ手順

### Step 1: 前提条件の確認

```bash
# AWS CLIが設定されていることを確認
aws sts get-caller-identity

# Terraformがインストールされていることを確認
terraform version

# プロジェクトディレクトリに移動
cd streamcaster/terraform/bootstrap
```

### Step 2: Bootstrap設定

```bash
# 設定ファイルをコピー
cp terraform.tfvars.example terraform.tfvars

# 設定を編集
vim terraform.tfvars
```

**terraform.tfvars の設定例:**
```hcl
# 基本設定
project_name = "streamcaster"
aws_region   = "ap-northeast-1"

# GitHub OIDC (オプション)
create_github_oidc_role = false
github_repository       = "azumag/streamcaster"
```

### Step 3: Bootstrap実行

```bash
# 初期化
terraform init

# プランの確認
terraform plan

# リソース作成
terraform apply
```

### Step 4: 出力情報の確認

```bash
# 重要な情報を出力
terraform output

# バックエンド設定を表示
terraform output backend_config_block
```

### Step 5: メイン設定の更新

Bootstrap完了後、以下の情報でメイン設定を更新します：

1. **terraform/main.tf のバックエンド設定を更新**
   ```hcl
   terraform {
     backend "s3" {
       bucket         = "streamcaster-terraform-state-xxxxxxxx"
       key            = "streamcaster/terraform.tfstate"
       region         = "ap-northeast-1"
       encrypt        = true
       dynamodb_table = "streamcaster-terraform-locks"
     }
   }
   ```

2. **GitHub Repository Secretsを設定**
   ```
   TF_STATE_BUCKET=streamcaster-terraform-state-xxxxxxxx
   TF_STATE_DYNAMODB_TABLE=streamcaster-terraform-locks
   ```

### Step 6: メイン設定の初期化

```bash
# メインディレクトリに移動
cd ../

# バックエンドを使用して初期化
terraform init

# 動作確認
terraform plan
```

## 🎛️ GitHub Actionsでの利用

### 方法1: OIDC Roleを使用（推奨）

**Repository Secrets設定:**
```
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/streamcaster-github-actions
TF_STATE_BUCKET=streamcaster-terraform-state-xxxxxxxx
TF_STATE_DYNAMODB_TABLE=streamcaster-terraform-locks
```

### 方法2: アクセスキーを使用（非推奨）

1. **GitHub OIDC Providerをセットアップ**
   ```bash
   # OIDCプロバイダーの作成（一度だけ実行）
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```

2. **Bootstrap設定でOIDC Roleを有効化**
   ```hcl
   create_github_oidc_role = true
   github_repository       = "yourusername/streamcaster"
   ```

3. **GitHub Actionsでroleを使用**
   ```yaml
   - name: Configure AWS credentials
     uses: aws-actions/configure-aws-credentials@v4
     with:
       role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
       aws-region: ap-northeast-1
   ```

## 📊 コスト見積もり

| リソース | 月額コスト | 備考 |
|----------|------------|------|
| **S3 Storage** | ~$0.023/GB | 状態ファイルは通常1MB未満 |
| **S3 Requests** | ~$0.0004/1000 PUT | CI/CDでの更新 |
| **DynamoDB** | ~$0.0000125/リクエスト | ロック操作 |
| **合計** | **$1-3/月** | 使用頻度により変動 |

## 🔒 セキュリティ機能

### S3バケット
- ✅ **暗号化**: AES256による暗号化
- ✅ **バージョニング**: 状態の履歴管理
- ✅ **パブリックアクセス拒否**: 完全にプライベート
- ✅ **ライフサイクル管理**: 古いバージョンの自動削除

### DynamoDB
- ✅ **Point-in-time Recovery**: データ復旧機能
- ✅ **サーバーサイド暗号化**: データ暗号化
- ✅ **Pay-per-request**: コスト最適化

### IAM
- ✅ **最小権限**: 必要最小限のアクセス権限
- ✅ **分離されたポリシー**: 状態管理専用権限
- ✅ **OIDC統合**: アクセスキー不要の認証

## 🛠️ 運用手順

### 状態確認
```bash
# 状態ファイルの確認
terraform show

# リモート状態の再読み込み
terraform refresh

# 状態の検証
terraform validate
```

### バックアップ
```bash
# 手動スナップショット作成
aws s3 cp s3://your-state-bucket/streamcaster/terraform.tfstate \
  ./backup/terraform.tfstate.$(date +%Y%m%d)

# DynamoDBのバックアップ作成
aws dynamodb create-backup \
  --table-name streamcaster-terraform-locks \
  --backup-name manual-backup-$(date +%Y%m%d)
```

### トラブルシューティング

#### 状態ロックの解除
```bash
# ロックIDを確認
terraform force-unlock <LOCK_ID>

# 手動でDynamoDBから削除
aws dynamodb delete-item \
  --table-name streamcaster-terraform-locks \
  --key '{"LockID":{"S":"your-lock-id"}}'
```

#### 状態の復旧
```bash
# 特定バージョンから復旧
aws s3 cp s3://your-state-bucket/streamcaster/terraform.tfstate \
  --version-id <VERSION_ID> \
  ./terraform.tfstate

# ローカル状態をリモートにプッシュ
terraform state push terraform.tfstate
```

## 🚨 緊急時対応

### Bootstrap環境の破壊
万が一Bootstrap環境を破壊した場合：

1. **新しいBootstrap環境を作成**
2. **既存状態ファイルを新しいバケットにコピー**
3. **GitHub Secretsを更新**
4. **terraform initを再実行**

### 状態ファイルの破損
```bash
# バックアップから復旧
aws s3 cp s3://your-state-bucket/streamcaster/terraform.tfstate \
  --version-id <GOOD_VERSION_ID> \
  s3://your-state-bucket/streamcaster/terraform.tfstate

# ローカルで確認してからプッシュ
terraform plan
terraform state push terraform.tfstate
```

## 📚 参考資料

- [Terraform Backend Configuration](https://terraform.io/docs/backends/config.html)
- [AWS S3 Backend](https://terraform.io/docs/backends/types/s3.html)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [Terraform State Management Best Practices](https://terraform.io/docs/state/index.html)

## ✅ チェックリスト

### Bootstrap完了チェック
- [ ] AWS CLIが正しく設定されている
- [ ] Bootstrap Terraformが正常に実行された
- [ ] S3バケットとDynamoDBテーブルが作成された
- [ ] IAMポリシーが作成された
- [ ] GitHub Repository Secretsが設定された

### メイン設定チェック
- [ ] terraform/main.tfのバックエンド設定が更新された
- [ ] terraform initが成功した
- [ ] terraform planが正常に動作した
- [ ] GitHub Actionsが正常に動作した

### セキュリティチェック
- [ ] S3バケットがプライベートである
- [ ] 暗号化が有効である
- [ ] アクセス権限が最小限である
- [ ] バージョニングが有効である

---

**作成日**: 2025年6月6日  
**対象バージョン**: Terraform 1.6.0+  
**最終更新**: 2025年6月6日