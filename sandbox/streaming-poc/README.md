# FFmpeg Streaming POC

動的プレイリスト更新によるRTMPストリーミングの実証実装です。

## 特徴

- FFmpegのconcat demuxerを使用した無限ループ配信
- 配信を維持したまま動的にプレイリストを更新
- Node.jsによる配信制御
- Dockerによる環境構築

## 構成

- **FFmpegコンテナ**: ストリーミング処理
- **RTMPサーバー**: nginx-rtmpによるRTMPサーバー

## 使用方法

### 1. ストリーミング開始

```bash
./test-stream.sh
```

### 2. ストリームを視聴

以下のいずれかの方法で視聴できます：

```bash
# ffplay使用
ffplay rtmp://localhost:1935/live/stream

# VLC使用
# VLCを開いて「ネットワークストリームを開く」から
# rtmp://localhost:1935/live/stream を入力
```

### 3. ストリーミング停止

```bash
./stop-stream.sh
```

## 配信スケジュール

1. **0-10秒**: 青色の待機画面
2. **10-40秒**: 緑色のメインコンテンツ
3. **40-50秒**: 青色の待機画面に戻る
4. **50秒**: 配信終了

## 技術詳細

### プレイリスト更新の仕組み

1. FFmpegは`-stream_loop -1`オプションで無限ループ再生
2. プレイリストファイルをアトミックに更新（rename操作）
3. FFmpegは次のループでプレイリストを再読み込み
4. 配信ストリームは途切れることなく継続

### ファイル構成

```
streaming-poc/
├── docker/
│   ├── Dockerfile.ffmpeg
│   ├── Dockerfile.rtmp
│   └── nginx.conf
├── scripts/
│   ├── stream-controller.js  # メイン制御スクリプト
│   ├── generate-test-videos.sh
│   └── package.json
├── videos/
│   ├── standby.mp4         # 自動生成される
│   └── main-content.mp4    # 自動生成される
├── playlists/
│   └── current.txt         # 動的に更新される
├── docker-compose.yml
├── test-stream.sh
└── stop-stream.sh
```

## カスタマイズ

### 配信タイミングの変更

`scripts/stream-controller.js`の以下の部分を編集：

```javascript
setTimeout(() => this.switchToMainContent(), 10000); // 10秒後に切り替え
setTimeout(() => this.switchToStandby(), 40000); // 40秒後に待機画面
setTimeout(() => this.stopStream(), 50000); // 50秒後に停止
```

### 新しい動画の追加

1. 動画ファイルを`videos/`に配置
2. `stream-controller.js`でプレイリストに追加：

```javascript
await this.updatePlaylist(['video1.mp4', 'video2.mp4']);
```
