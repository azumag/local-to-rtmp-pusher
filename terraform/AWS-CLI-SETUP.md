# AWS CLI セットアップガイド

このガイドでは、StreamCasterプロジェクトでTerraformを使用するために必要なAWS CLIのインストールと設定方法を説明します。

## 📋 概要

AWS CLIは以下の用途で使用します：
- **Terraform認証**: AWSリソースの作成・管理
- **状態管理**: S3とDynamoDBへのアクセス
- **CI/CD**: GitHub Actionsでの自動デプロイ
- **運用管理**: インスタンスの監視・バックアップ

## 🔧 インストール方法

### macOS

#### 方法1: 公式インストーラー（推奨）
```bash
# 最新版をダウンロードしてインストール
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# インストール確認
aws --version
```

#### 方法2: Homebrew
```bash
# Homebrewでインストール
brew install awscli

# インストール確認
aws --version
```

### Linux (Ubuntu/Debian)

#### 方法1: 公式インストーラー（推奨）
```bash
# 依存関係のインストール
sudo apt update
sudo apt install -y curl unzip

# AWS CLI v2をダウンロード
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip

# インストール実行
sudo ./aws/install

# インストール確認
aws --version

# 一時ファイルのクリーンアップ
rm -rf aws awscliv2.zip
```

#### 方法2: パッケージマネージャー
```bash
# snapでインストール（Ubuntu）
sudo snap install aws-cli --classic

# またはpipでインストール（非推奨）
pip3 install awscli --upgrade --user
```

### Linux (CentOS/RHEL/Amazon Linux)

```bash
# 依存関係のインストール
sudo yum update -y
sudo yum install -y curl unzip

# AWS CLI v2をダウンロード
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip

# インストール実行
sudo ./aws/install

# インストール確認
aws --version

# 一時ファイルのクリーンアップ
rm -rf aws awscliv2.zip
```

### Windows

#### 方法1: MSIインストーラー
1. [AWS CLI Windows Installer](https://awscli.amazonaws.com/AWSCLIV2.msi)をダウンロード
2. ダウンロードしたMSIファイルを実行
3. インストールウィザードに従って進行
4. PowerShellまたはコマンドプロンプトで確認：
   ```cmd
   aws --version
   ```

#### 方法2: PowerShell
```powershell
# PowerShellで実行
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi /quiet

# インストール確認
aws --version
```

### Docker環境

```bash
# Docker内でAWS CLIを使用
docker run --rm -it amazon/aws-cli:latest --version

# エイリアスとして設定
echo 'alias aws="docker run --rm -it -v ~/.aws:/root/.aws amazon/aws-cli:latest"' >> ~/.bashrc
source ~/.bashrc
```

## ⚙️ 初期設定

### 基本設定

```bash
# 対話形式での設定
aws configure

# 以下の情報を入力：
# AWS Access Key ID [None]: AKIA...
# AWS Secret Access Key [None]: ...
# Default region name [None]: ap-northeast-1
# Default output format [None]: json
```

### 設定項目の詳細

| 項目 | 説明 | 推奨値 |
|------|------|--------|
| **Access Key ID** | AWSアクセスキー | IAMで作成したキー |
| **Secret Access Key** | AWSシークレットキー | IAMで作成したシークレット |
| **Default region** | デフォルトリージョン | `ap-northeast-1` (東京) |
| **Output format** | 出力形式 | `json` |

### プロファイル設定

複数のAWSアカウントを使い分ける場合：

```bash
# 名前付きプロファイルで設定
aws configure --profile streamcaster-dev
aws configure --profile streamcaster-prod

# プロファイルを指定して使用
aws s3 ls --profile streamcaster-prod

# 環境変数で指定
export AWS_PROFILE=streamcaster-prod
aws s3 ls
```

## 🔑 IAMユーザーの作成

### ユーザー作成手順

1. **AWS Consoleにログイン**
   - [AWS Console](https://console.aws.amazon.com/)にアクセス
   - 管理者権限でログイン

2. **IAMサービスに移動**
   ```
   Services → IAM → Users → Add users
   ```

3. **ユーザー詳細設定**
   - **ユーザー名**: `streamcaster-terraform`
   - **アクセスタイプ**: ✅ Programmatic access

4. **権限設定**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "lightsail:*",
           "s3:*",
           "dynamodb:*",
           "iam:CreateRole",
           "iam:DeleteRole",
           "iam:AttachRolePolicy",
           "iam:DetachRolePolicy",
           "iam:CreatePolicy",
           "iam:DeletePolicy",
           "iam:GetRole",
           "iam:GetPolicy",
           "iam:ListRoles",
           "iam:ListPolicies",
           "iam:PassRole"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

5. **アクセスキー保存**
   - Access Key IDとSecret Access Keyを安全に保存
   - **重要**: この情報は再表示されません

### 最小権限の原則

本番環境では、より制限的な権限を設定：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lightsail:CreateInstances",
        "lightsail:DeleteInstance",
        "lightsail:GetInstances",
        "lightsail:AllocateStaticIp",
        "lightsail:AttachStaticIp",
        "lightsail:CreateKeyPair",
        "lightsail:OpenInstancePublicPorts"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::streamcaster-terraform-state-*",
        "arn:aws:s3:::streamcaster-terraform-state-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/streamcaster-terraform-locks"
    }
  ]
}
```

## 🛡️ セキュリティ設定

### MFA（多要素認証）の設定

```bash
# MFAデバイスの設定確認
aws iam list-mfa-devices

# MFA必須のポリシー例
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:GetUser",
        "iam:ListMFADevices"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

### アクセスキーのローテーション

```bash
# 新しいアクセスキーを作成
aws iam create-access-key --user-name streamcaster-terraform

# 古いキーを無効化（新しいキーのテスト後）
aws iam update-access-key --access-key-id AKIA... --status Inactive --user-name streamcaster-terraform

# 古いキーを削除
aws iam delete-access-key --access-key-id AKIA... --user-name streamcaster-terraform
```

### 設定ファイルの保護

```bash
# 設定ファイルの権限を制限
chmod 600 ~/.aws/credentials
chmod 600 ~/.aws/config

# 設定ファイルの場所確認
ls -la ~/.aws/
```

## ✅ 動作確認

### 基本接続テスト

```bash
# AWS接続テスト
aws sts get-caller-identity

# 期待される出力例:
# {
#     "UserId": "AIDACKCEVSQ6C2EXAMPLE",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/streamcaster-terraform"
# }
```

### Lightsail権限テスト

```bash
# Lightsailサービスへのアクセステスト
aws lightsail get-regions

# 利用可能なゾーンの確認
aws lightsail get-availability-zones --region ap-northeast-1

# インスタンスプランの確認
aws lightsail get-bundles --region ap-northeast-1
```

### S3権限テスト

```bash
# S3バケットの一覧（権限がある場合）
aws s3 ls

# 特定のリージョンのバケット確認
aws s3api list-buckets --query 'Buckets[?contains(Name, `terraform-state`)]'
```

## 🐛 トラブルシューティング

### よくある問題と解決方法

#### 1. 認証エラー
```bash
# エラー: Unable to locate credentials
# 解決方法: 設定を再確認
aws configure list
aws configure

# 設定ファイルの確認
cat ~/.aws/credentials
cat ~/.aws/config
```

#### 2. 権限エラー
```bash
# エラー: Access Denied
# 解決方法: IAM権限を確認
aws iam get-user
aws iam list-attached-user-policies --user-name $(aws iam get-user --query User.UserName --output text)
```

#### 3. リージョンエラー
```bash
# エラー: The specified region does not exist
# 解決方法: リージョン設定を確認
aws configure get region
aws configure set region ap-northeast-1
```

#### 4. バージョンの問題
```bash
# AWS CLI v1からv2への移行
pip3 uninstall awscli  # v1を削除
# v2を新規インストール（上記手順参照）

# バージョン確認
aws --version
```

### ログとデバッグ

```bash
# デバッグモードで実行
aws s3 ls --debug

# ログレベルの設定
export AWS_CLI_LOG_LEVEL=debug
aws s3 ls

# 設定の詳細確認
aws configure list-profiles
aws configure list
```

## 🔄 Terraform統合

### Terraformでの使用確認

```bash
# Terraformプロジェクトディレクトリで
cd terraform/bootstrap

# Terraform初期化
terraform init

# AWSプロバイダーの動作確認
terraform plan
```

### 環境変数での設定

```bash
# CI/CD環境での設定例
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="ap-northeast-1"

# Terraformでの確認
terraform plan
```

## 📚 参考資料

- [AWS CLI公式ドキュメント](https://docs.aws.amazon.com/cli/)
- [AWS CLI v2インストールガイド](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
- [IAMベストプラクティス](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

## 📋 チェックリスト

### インストール完了チェック
- [ ] AWS CLI v2がインストールされている
- [ ] `aws --version`でバージョンが表示される
- [ ] IAMユーザーが作成されている
- [ ] アクセスキーが生成されている

### 設定完了チェック
- [ ] `aws configure`で設定が完了している
- [ ] `aws sts get-caller-identity`で認証できる
- [ ] `aws lightsail get-regions`でLightsailにアクセスできる
- [ ] 設定ファイルの権限が適切（600）

### セキュリティチェック
- [ ] 不要なアクセスキーが削除されている
- [ ] 最小権限の原則が適用されている
- [ ] 設定ファイルが保護されている
- [ ] MFAが有効になっている（推奨）

---

**作成日**: 2025年6月6日  
**対象バージョン**: AWS CLI v2  
**最終更新**: 2025年6月6日