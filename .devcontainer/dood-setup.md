# Docker-outside-of-Docker (DooD) セットアップ

## 概要
Dev Container内からホストのDockerデーモンを使用するための設定を完了しました。

## 変更内容

### 1. devcontainer.json
- `docker-in-docker` フィーチャーを削除
- `docker-outside-of-docker` フィーチャーに変更

### 2. docker-compose.yml
- `/var/run/docker.sock` のマウント設定は既に存在（変更なし）

## 使用方法

### Dev Containerの再起動
1. VS Codeのコマンドパレット（Cmd/Ctrl + Shift + P）を開く
2. "Dev Containers: Rebuild Container" を選択
3. コンテナが再起動されるのを待つ

### 動作確認
再起動後、以下のコマンドで確認：

```bash
# Dockerが使用可能か確認
docker version

# コンテナ一覧を表示（ホストのコンテナが表示される）
docker ps

# streaming-pocのテストを実行
cd /workspace/sandbox/streaming-poc
./test-rtmp-only.sh
```

## 注意事項

### DooD使用時の特徴
- Dev Container内で作成したコンテナはホストOS上に作成される
- ボリュームマウントのパスはホストOS基準になる
- ポートはホストOSで直接開かれる

### トラブルシューティング

#### "permission denied" エラーが続く場合
1. ホスト側でDockerグループに所属しているか確認
2. Dev Containerを完全に削除して再作成：
   ```bash
   # VS Codeを閉じてから
   docker rm -f $(docker ps -aq --filter "label=vscode.devcontainer")
   ```

#### ボリュームマウントの問題
DooD環境では、コンテナ内のパスではなくホストのパスを使用する必要があります：

```yaml
# 誤り（コンテナ内のパス）
volumes:
  - /workspace/myfile:/app/myfile

# 正しい（ホストのパス）
volumes:
  - ${HOST_PROJECT_PATH}/myfile:/app/myfile
```

## 参考リンク
- [VS Code Dev Containers - Docker outside of Docker](https://github.com/devcontainers/features/tree/main/src/docker-outside-of-docker)