# Dev Container内でのMCPサーバー設定

## 問題点

1. **MCPサーバーの実行環境**
   - MCPサーバーはNode.jsプロセスとして実行される
   - Dev Container内で実行される場合、コンテナ内にMCPサーバーがインストールされている必要がある

2. **パスの違い**
   - ホストマシン: `/Users/azumag/.nvm/versions/node/v23.10.0/bin/mcp-server-puppeteer`
   - コンテナ内: 異なるパスになる

## 解決策

### 1. Dev Container内にMCPサーバーをインストール

Dockerfileに追加:
```dockerfile
# Install MCP servers
RUN npm install -g @modelcontextprotocol/server-puppeteer \
    @modelcontextprotocol/server-playwright
```

### 2. コンテナ内でのMCP設定

```bash
# コンテナ内で実行
claude configure

# MCPサーバーの設定を追加
# 設定ファイルは /home/node/.config/claude-code/config.json に保存される
```

### 3. ネットワーク考慮事項

- **Puppeteer/Playwright**: ヘッドレスブラウザをコンテナ内で実行
- **追加の依存関係**: Chrome/Chromiumのインストールが必要

```dockerfile
# Puppeteer用の依存関係
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils
```

### 4. ボリュームマウント

docker-compose.ymlで設定済み:
```yaml
volumes:
  - claude-code-config:/home/node/.config/claude-code
```

これにより、MCP設定も永続化される。

## 使用例

```bash
# コンテナ内で
claude "Puppeteerを使ってスクリーンショットを撮って"
```

## 注意点

1. **セキュリティ**: コンテナ内でブラウザを実行する際は、適切なサンドボックス設定が必要
2. **パフォーマンス**: コンテナ内でのブラウザ実行は若干遅い可能性がある
3. **ディスプレイ**: ヘッドレスモードでの実行が前提