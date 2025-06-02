# FFmpeg Streaming POC

動的プレイリスト更新によるRTMPストリーミングの実証実装です。VLC互換性を考慮したFFmpeg設定により、安定したRTMPストリーミングを実現します。

## 特徴

- FFmpegのconcat demuxerを使用した無限ループ配信
- 配信を維持したまま動的にプレイリストを更新
- VLC互換性を考慮したH.264 Baselineプロファイル
- Node.jsによる配信制御
- Dockerによる環境構築

## 構成

- **FFmpegコンテナ**: ストリーミング処理（Alpine + FFmpeg + Node.js）
- **RTMPサーバー**: nginx-rtmpによるRTMPサーバー

## 動作モード

### 1. シンプルモード（推奨）

- 個別のFFmpegプロセスによる順次配信
- 安定した動作を実現
- VLCでの再生確認済み

### 2. 動的モード（実験的）

- concat demuxerとプレイリスト更新による無限ループ配信
- 配信継続性の検証用

## 使用方法

### RTMPストリーミングテスト（推奨）

```bash
# シンプルモードでのRTMP配信テスト
./test-rtmp-only.sh
```

### その他のテストスクリプト

```bash
# シンプルモードでのテスト
./test-simple.sh

# 動的モードでのテスト
./test-stream.sh

# VLC互換性テスト
./test-vlc.sh
```

### ストリーム視聴

**VLCでの視聴（推奨）**

1. VLCを開く
2. `Media` > `Open Network Stream`
3. URL: `rtmp://localhost:1935/live/stream`
4. `Play`をクリック

**ffplayでの視聴**

```bash
ffplay rtmp://localhost:1935/live/stream
```

### ストリーミング停止

```bash
./stop-stream.sh
```

## 配信スケジュール

1. **0-10秒**: 青色の待機画面（1920x1080, 30fps）
2. **10-40秒**: 緑色のメインコンテンツ（1920x1080, 30fps）
3. **40-50秒**: 青色の待機画面に戻る
4. **50秒**: 配信終了

## 技術詳細

### VLC互換性のための設定

```javascript
// FFmpeg設定例（stream-controller-simple.js）
const ffmpegArgs = [
  '-re', // リアルタイムレート
  '-i',
  videoFile,
  '-c:v',
  'libx264',
  '-preset',
  'veryfast', // 高速エンコード
  '-profile:v',
  'baseline', // VLC互換性
  '-level',
  '3.1',
  '-g',
  '60', // GOP サイズ
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-ar',
  '44100',
  '-ac',
  '2', // ステレオ
  '-pix_fmt',
  'yuv420p',
  '-r',
  '30', // フレームレート
  '-maxrate',
  '2500k', // 最大ビットレート
  '-bufsize',
  '5000k', // バッファサイズ
  '-f',
  'flv', // FLV出力
  this.rtmpUrl,
];
```

### プレイリスト更新の仕組み（動的モード）

1. FFmpegは`-stream_loop -1`オプションで無限ループ再生
2. プレイリストファイルをアトミックに更新（rename操作）
3. FFmpegは次のループでプレイリストを再読み込み
4. 配信ストリームは途切れることなく継続

### RTMP サーバー設定

```nginx
# nginx.conf の要点
application live {
    live on;
    record off;

    # Docker ネットワークからの配信を許可
    allow publish 127.0.0.1;
    allow publish 172.0.0.0/8;
    allow publish 192.168.0.0/16;

    # 任意からの視聴を許可
    allow play all;

    # 安定性向上のための設定
    wait_key on;
    wait_video on;
    drop_idle_publisher 10s;
}
```

## ファイル構成

```
streaming-poc/
├── docker/
│   ├── Dockerfile.ffmpeg       # FFmpeg + Node.js コンテナ
│   ├── Dockerfile.rtmp         # nginx-rtmp コンテナ
│   └── nginx.conf              # RTMP サーバー設定
├── scripts/
│   ├── stream-controller.js        # 動的プレイリスト制御
│   ├── stream-controller-simple.js # シンプル制御（推奨）
│   ├── entrypoint.sh              # コンテナエントリーポイント
│   ├── generate-test-videos.sh    # テスト動画生成
│   └── package.json
├── videos/
│   ├── standby.mp4             # 青色待機画面（自動生成）
│   └── main-content.mp4        # 緑色コンテンツ（自動生成）
├── playlists/
│   └── current.txt             # 動的プレイリスト
├── docker-compose.yml          # Docker Compose 設定
├── test-rtmp-only.sh          # RTMP専用テスト（推奨）
├── test-simple.sh             # シンプルモードテスト
├── test-stream.sh             # 動的モードテスト
├── test-vlc.sh                # VLC互換性テスト
├── check-stream.sh            # ストリーム状態確認
└── stop-stream.sh             # 配信停止
```

## デバッグ・監視

### ストリーム状態確認

```bash
# ストリーム統計の確認
curl -s http://localhost:8080/stat

# コンテナログの確認
docker logs streaming-ffmpeg
docker logs streaming-rtmp-server

# ストリーム状態の詳細確認
./check-stream.sh
```

### よくある問題と解決方法

**VLCで "Input/output error" が発生する場合:**

- RTMPサーバーが起動しているか確認: `curl http://localhost:8080/stat`
- ファイアウォール設定の確認: ポート1935と8080が開いているか
- FFmpegログの確認: `docker logs streaming-ffmpeg`

**動画が生成されない場合:**

- Dockerコンテナ内でFFmpegが正常に動作しているか確認
- ディスク容量の確認
- `docker exec streaming-ffmpeg ls -la /app/videos` でファイル存在確認

## カスタマイズ

### 配信タイミングの変更

`scripts/stream-controller-simple.js`を編集：

```javascript
// 配信時間の調整
await this.streamVideo('standby.mp4', 15); // 待機画面15秒
await this.streamVideo('main-content.mp4', 60); // メイン60秒
await this.streamVideo('standby.mp4', 10); // 待機画面10秒
```

### 新しい動画の追加

1. 動画ファイルを`videos/`に配置
2. `stream-controller-simple.js`で使用：

```javascript
await this.streamVideo('custom-video.mp4', 30);
```

### エンコード設定の調整

`scripts/stream-controller-simple.js`のffmpegArgsを編集：

```javascript
// 解像度の変更
'-s', '1280x720',  // HD解像度

// ビットレートの調整
'-maxrate', '1500k',
'-bufsize', '3000k',

// フレームレートの変更
'-r', '25',
```

## 応用例

このPOCシステムは以下の用途に展開可能です：

- ライブ配信システムのプロトタイプ
- 動的コンテンツ切り替え機能の検証
- RTMP配信の負荷テスト
- FFmpegパラメータの最適化検証
- 複数エンドポイント同時配信の実装

## ライセンス

このPOCは実証目的で作成されており、本番環境での使用には追加の考慮が必要です。
