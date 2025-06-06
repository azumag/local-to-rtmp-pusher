# Terraform インストールガイド

このガイドでは、StreamCasterプロジェクトで使用するTerraformのインストール方法を説明します。

## 📋 概要

Terraformは以下の用途で使用します：
- **Infrastructure as Code**: AWSリソースの定義・管理
- **自動化**: インフラの構築・更新・破棄
- **バージョン管理**: インフラ構成の履歴管理
- **マルチ環境**: dev/staging/prodの環境分離

## 🎯 推奨バージョン

- **Terraform**: v1.6.0以上
- **対応OS**: macOS, Linux, Windows

## 🔧 インストール方法

### macOS

#### 方法1: Homebrew（推奨）
```bash
# Homebrewでインストール
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# インストール確認
terraform version
```

#### 方法2: 手動インストール
```bash
# 最新版をダウンロード
curl -LO https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_darwin_amd64.zip

# Apple Silicon Macの場合
curl -LO https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_darwin_arm64.zip

# 解凍とインストール
unzip terraform_1.6.6_darwin_*.zip
sudo mv terraform /usr/local/bin/

# インストール確認
terraform version

# 一時ファイルのクリーンアップ
rm terraform_1.6.6_darwin_*.zip
```

### Linux (Ubuntu/Debian)

#### 方法1: 公式リポジトリ（推奨）
```bash
# 必要なパッケージをインストール
sudo apt-get update
sudo apt-get install -y gnupg software-properties-common

# HashiCorpのGPGキーを追加
wget -O- https://apt.releases.hashicorp.com/gpg | \
    gpg --dearmor | \
    sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg

# リポジトリを追加
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
    https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
    sudo tee /etc/apt/sources.list.d/hashicorp.list

# パッケージリストを更新してインストール
sudo apt update
sudo apt-get install terraform

# インストール確認
terraform version
```

#### 方法2: 手動インストール
```bash
# 最新版をダウンロード
curl -LO https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip

# 解凍とインストール
unzip terraform_1.6.6_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# 実行権限を付与
sudo chmod +x /usr/local/bin/terraform

# インストール確認
terraform version

# 一時ファイルのクリーンアップ
rm terraform_1.6.6_linux_amd64.zip
```

### Linux (CentOS/RHEL/Amazon Linux)

#### YUMリポジトリを使用
```bash
# リポジトリ設定をインストール
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/RHEL/hashicorp.repo

# Terraformをインストール
sudo yum -y install terraform

# インストール確認
terraform version
```

#### 手動インストール
```bash
# 最新版をダウンロード
curl -LO https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip

# 解凍とインストール
unzip terraform_1.6.6_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# インストール確認
terraform version

# 一時ファイルのクリーンアップ
rm terraform_1.6.6_linux_amd64.zip
```

### Windows

#### 方法1: Chocolatey
```powershell
# Chocolateyでインストール
choco install terraform

# インストール確認
terraform version
```

#### 方法2: 手動インストール
1. [Terraform Windows版](https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_windows_amd64.zip)をダウンロード
2. ZIPファイルを解凍
3. `terraform.exe`を`C:\Windows\System32`または任意のディレクトリに配置
4. PATH環境変数にディレクトリを追加
5. PowerShellまたはコマンドプロンプトで確認：
   ```cmd
   terraform version
   ```

#### 方法3: Scoop
```powershell
# Scoopでインストール
scoop bucket add hashicorp https://github.com/hashicorp/scoop-hashicorp.git
scoop install terraform

# インストール確認
terraform version
```

### Docker環境

```bash
# Docker内でTerraformを使用
docker run --rm -it hashicorp/terraform:1.6 version

# エイリアスとして設定
echo 'alias terraform="docker run --rm -it -v $(pwd):/workspace -w /workspace hashicorp/terraform:1.6"' >> ~/.bashrc
source ~/.bashrc

# 動作確認
terraform version
```

## ⚙️ 初期設定

### 基本確認
```bash
# バージョン確認
terraform version

# ヘルプ表示
terraform --help

# サブコマンドのヘルプ
terraform plan --help
```

### タブ補完の設定

#### Bash
```bash
# タブ補完を有効化
terraform -install-autocomplete

# .bashrcを再読み込み
source ~/.bashrc
```

#### Zsh
```bash
# タブ補完を有効化
terraform -install-autocomplete

# .zshrcを再読み込み
source ~/.zshrc
```

### プラグインディレクトリの設定
```bash
# プラグインディレクトリを作成
mkdir -p ~/.terraform.d/plugins

# Terraformの設定ディレクトリ確認
ls -la ~/.terraform.d/
```

## 🚀 StreamCasterプロジェクトでの使用

### 1. プロジェクトの初期化
```bash
# プロジェクトディレクトリに移動
cd /path/to/streamcaster/terraform

# Terraformを初期化
terraform init

# 設定の検証
terraform validate

# フォーマットチェック
terraform fmt -check
```

### 2. 基本的なワークフロー
```bash
# プランの確認
terraform plan

# 変更の適用
terraform apply

# リソースの削除
terraform destroy

# 状態の確認
terraform show
```

### 3. 環境別の管理
```bash
# 開発環境
terraform plan -var-file="environments/dev/terraform.tfvars"
terraform apply -var-file="environments/dev/terraform.tfvars"

# 本番環境
terraform plan -var-file="environments/prod/terraform.tfvars"
terraform apply -var-file="environments/prod/terraform.tfvars"
```

## 🔍 バージョン管理

### tfenv（Terraform Version Manager）

複数のTerraformバージョンを管理する場合：

#### インストール
```bash
# macOS (Homebrew)
brew install tfenv

# Linux (Git)
git clone https://github.com/tfutils/tfenv.git ~/.tfenv
echo 'export PATH="$HOME/.tfenv/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 使用方法
```bash
# 利用可能なバージョンを確認
tfenv list-remote

# 特定バージョンをインストール
tfenv install 1.6.6

# バージョンを切り替え
tfenv use 1.6.6

# 現在のバージョンを確認
tfenv list
```

### .terraform-version ファイル
```bash
# プロジェクトディレクトリに作成
echo "1.6.6" > .terraform-version

# tfenvが自動的にこのバージョンを使用
terraform version
```

## 🛡️ セキュリティ設定

### 状態ファイルの保護
```bash
# ローカル状態ファイルの権限を制限
chmod 600 terraform.tfstate*

# .terraformディレクトリの権限確認
ls -la .terraform/
```

### 機密情報の管理
```bash
# 環境変数での設定
export TF_VAR_stream_key="your_secret_key"
export TF_VAR_api_key="your_api_key"

# .envファイルの使用（.gitignoreに追加）
echo "TF_VAR_stream_key=your_secret_key" > .env
source .env
```

### プラグインの検証
```bash
# プロバイダーの検証
terraform providers

# プロバイダーのロック
terraform providers lock
```

## 📊 パフォーマンス最適化

### 並列実行の調整
```bash
# 並列度を指定
terraform plan -parallelism=10
terraform apply -parallelism=10
```

### ログレベルの設定
```bash
# デバッグログを有効化
export TF_LOG=DEBUG
terraform plan

# 特定コンポーネントのログ
export TF_LOG_PROVIDER=DEBUG
```

### キャッシュの利用
```bash
# プロバイダーキャッシュディレクトリの設定
export TF_PLUGIN_CACHE_DIR="$HOME/.terraform.d/plugin-cache"
mkdir -p $TF_PLUGIN_CACHE_DIR
```

## 🐛 トラブルシューティング

### よくある問題と解決方法

#### 1. コマンドが見つからない
```bash
# PATHの確認
echo $PATH

# Terraformの場所確認
which terraform

# 手動でPATHに追加
export PATH=$PATH:/usr/local/bin
```

#### 2. 権限エラー
```bash
# 実行権限を付与
chmod +x /usr/local/bin/terraform

# sudo権限での実行（非推奨）
sudo terraform version
```

#### 3. プロバイダーのダウンロードエラー
```bash
# プロキシ設定の確認
echo $HTTP_PROXY
echo $HTTPS_PROXY

# 手動でプロバイダーを再取得
rm -rf .terraform
terraform init
```

#### 4. 状態ファイルのロック
```bash
# ロックの強制解除
terraform force-unlock <LOCK_ID>

# 状態の確認
terraform show
```

#### 5. バージョン互換性の問題
```bash
# 現在のバージョン確認
terraform version

# 必要バージョンの指定（terraform block）
terraform {
  required_version = ">= 1.6.0"
}
```

### ログの確認
```bash
# 詳細ログを出力
export TF_LOG=TRACE
terraform plan 2>&1 | tee terraform.log

# ログファイルの確認
less terraform.log
```

## 📚 参考資料

- [Terraform公式ドキュメント](https://terraform.io/docs/)
- [Terraform Install Guide](https://terraform.io/downloads)
- [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Terraform Best Practices](https://terraform.io/docs/cloud/guides/recommended-practices/)

## ✅ チェックリスト

### インストール完了チェック
- [ ] Terraformがインストールされている
- [ ] `terraform version`でバージョンが表示される
- [ ] タブ補完が設定されている
- [ ] AWS CLIが設定されている

### プロジェクト準備チェック
- [ ] プロジェクトディレクトリに移動できる
- [ ] `terraform init`が成功する
- [ ] `terraform validate`が成功する
- [ ] `terraform plan`が実行できる

### セキュリティチェック
- [ ] 状態ファイルの権限が適切である
- [ ] 機密情報が環境変数で管理されている
- [ ] .gitignoreに適切な除外設定がある
- [ ] プロバイダーが検証されている

---

**作成日**: 2025年6月6日  
**対象バージョン**: Terraform 1.6.0+  
**最終更新**: 2025年6月6日