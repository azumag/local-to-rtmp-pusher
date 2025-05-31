# StreamCaster 開発環境セットアップ

## ホットリロード対応の開発環境

StreamCasterは開発時にホットリロードが有効な環境を提供します。フロントエンドのコードを変更すると、コンテナを再起動することなく自動的に変更が反映されます。

## クイックスタート

### 1. 開発環境の起動

```bash
# 開発環境を起動（ホットリロード有効）
make dev

# または個別のコマンド
docker-compose -f docker-compose.dev.yml up -d
```

### 2. アクセスURL

- **フロントエンド開発サーバー**: http://localhost:8080
- **バックエンドAPI**: http://localhost:3001
- **RTMPサーバー**: rtmp://localhost:1935/live

### 3. 開発時の便利なコマンド

```bash
# ログを表示
make dev-logs

# フロントエンドのログのみ表示
make logs-frontend

# バックエンドのログのみ表示
make logs-backend

# フロントエンドコンテナにシェルアクセス
make dev-shell

# 開発環境を停止
make dev-down
```

## ホットリロードの仕組み

### フロントエンド

1. **ボリュームマウント**: `src`と`public`ディレクトリがコンテナにマウントされています
2. **ファイル監視**: `CHOKIDAR_USEPOLLING=true`環境変数により、Dockerコンテナ内でもファイル変更を検知
3. **自動リロード**: React開発サーバーが変更を検知して自動的にブラウザをリロード

### 設定ファイル

- `frontend/Dockerfile.dev`: 開発用Dockerfile（npm startを実行）
- `docker-compose.dev.yml`: 開発用Docker Compose設定
- `frontend/.env.development`: 開発環境変数

## 本番環境との違い

| 項目                   | 開発環境                      | 本番環境          |
| ---------------------- | ----------------------------- | ----------------- |
| フロントエンドサーバー | React開発サーバー (port 8080) | Nginx (port 8080) |
| ホットリロード         | 有効                          | 無効              |
| ソースマップ           | 有効                          | 無効              |
| ビルド最適化           | 無効                          | 有効              |
| デバッグ情報           | 表示                          | 非表示            |

## トラブルシューティング

### ホットリロードが効かない場合

1. **権限の確認**

   ```bash
   # ファイルの権限を確認
   ls -la frontend/src
   ```

2. **ポーリング設定の確認**

   ```bash
   # コンテナ内の環境変数を確認
   docker-compose -f docker-compose.dev.yml exec streamcaster-frontend-dev env | grep CHOKIDAR
   ```

3. **コンテナの再起動**
   ```bash
   make restart-frontend
   ```

### APIへの接続エラー

1. **プロキシ設定の確認**: `frontend/package.json`の`proxy`フィールド
2. **環境変数の確認**: `frontend/.env.development`の`REACT_APP_API_URL`
3. **バックエンドの起動確認**: `docker-compose -f docker-compose.dev.yml ps`

## 開発フロー

1. **コード変更**: VSCodeなどでコードを編集
2. **自動反映**: 保存すると自動的にブラウザに反映
3. **デバッグ**: ブラウザの開発者ツールでデバッグ
4. **テスト実行**: `docker-compose -f docker-compose.dev.yml exec streamcaster-frontend-dev npm test`

## 推奨される開発環境

- **エディタ**: VSCode with ESLint, Prettier拡張機能
- **ブラウザ**: Chrome/Firefox with React Developer Tools
- **ターミナル**: 複数タブ対応（ログ監視用）

## 注意事項

- `node_modules`はコンテナ内で管理されるため、ホストマシンでの`npm install`は不要
- 新しい依存関係を追加した場合は、コンテナの再ビルドが必要
  ```bash
  make dev-build
  make dev
  ```
