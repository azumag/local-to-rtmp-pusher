# RTMPストリーミング構造変更計画

**作成日**: 2025年6月1日  
**目的**: 永続的なRTMPストリーミング接続と柔軟なコンテンツ配信システムの実装

## 概要

現在のファイル単位ストリーミングから、セッション型ストリーミングに構造を変更し、以下の機能を実現する：

1. **2つのRTMPエンドポイント同時配信**
2. **永続的なストリーミング接続維持**
3. **静止画とファイル間の動的切り替え**
4. **改良されたUI/UX**

## 要件

### 機能要件

- [ ] 2つの異なるRTMPサーバーへの同時配信
- [ ] ストリーミングセッションの永続化（開始→停止まで接続維持）
- [ ] ユーザー設定可能な静止画表示
- [ ] ファイル間のシームレス切り替え
- [ ] 簡潔なトランジション効果（外部アニメーション対応）
- [ ] 既存ページ構成の維持

### 技術要件

- [ ] 再接続：10秒間隔、最大10回試行
- [ ] FFmpegマルチ出力（teeフィルター）
- [ ] 動的入力ソース切り替え
- [ ] 接続状態監視・自動復旧

## 設計詳細

### 1. アーキテクチャ変更

#### 従来の構造

```
ファイル選択 → FFmpegプロセス起動 → RTMP配信 → プロセス終了
```

#### 新しい構造

```
配信セッション開始 → 永続FFmpegプロセス（静止画） → ファイル切り替え → 配信セッション終了
```

### 2. デュアルRTMP配信設計

#### FFmpegコマンド例

```bash
ffmpeg -i input.mp4 \
  -f flv rtmp://server1/live/key1 \
  -f flv rtmp://server2/live/key2
```

#### 設定管理

```javascript
{
  rtmpEndpoint1: {
    url: "rtmp://server1/live",
    streamKey: "key1",
    enabled: true
  },
  rtmpEndpoint2: {
    url: "rtmp://server2/live",
    streamKey: "key2",
    enabled: false
  }
}
```

### 3. 永続的接続維持

#### セッション状態管理

```javascript
sessionStates = {
  DISCONNECTED: 'disconnected', // 未接続
  CONNECTING: 'connecting', // 接続中
  CONNECTED: 'connected', // 接続済み（静止画配信中）
  STREAMING: 'streaming', // ファイル配信中
  RECONNECTING: 'reconnecting', // 再接続中
  ERROR: 'error', // エラー状態
};
```

#### FFmpeg再接続オプション

```javascript
ffmpegOptions = [
  '-reconnect',
  '1',
  '-reconnect_streamed',
  '1',
  '-reconnect_delay_max',
  '10',
  '-rtmp_live',
  'live',
  '-rtmp_buffer',
  '1000',
];
```

### 4. 静止画表示システム

#### 機能仕様

- ユーザー画像アップロード機能
- デフォルト待機画面提供
- 任意フォーマット対応（jpg, png, gif等）
- 自動リサイズ・アスペクト比調整

#### FFmpeg実装

```bash
# 静止画ループ再生
ffmpeg -loop 1 -i standby.jpg -c:v libx264 -t 3600 -f flv rtmp://server/live/key

# 動的入力切り替え（concat demuxer使用）
ffmpeg -f concat -safe 0 -i playlist.txt -c copy -f flv rtmp://server/live/key
```

### 5. ファイル切り替えシステム

#### 切り替え方式

1. **Concat Demuxer方式**: プレイリスト更新による切り替え
2. **Filter Graph方式**: 複数入力の動的切り替え

#### トランジション効果

```bash
# フェード効果
[0:v][1:v]xfade=transition=fade:duration=1:offset=10[v]

# 外部アニメーション（クロマキー）
[0:v][1:v]overlay=chromakey=green:shortest=1[v]
```

### 6. API設計

#### 新エンドポイント

```javascript
// セッション管理
POST   /api/stream/session/start    // 配信セッション開始
POST   /api/stream/session/stop     // 配信セッション停止
GET    /api/stream/session/status   // セッション状態取得

// コンテンツ制御
POST   /api/stream/content/switch   // ファイル切り替え
POST   /api/stream/content/idle     // 静止画に戻る
POST   /api/stream/content/upload   // 静止画アップロード

// 設定管理
POST   /api/stream/config/rtmp      // RTMP設定保存
GET    /api/stream/config/rtmp      // RTMP設定取得
```

#### リクエスト例

```javascript
// セッション開始
POST /api/stream/session/start
{
  "endpoints": [
    { "url": "rtmp://server1/live", "key": "key1" },
    { "url": "rtmp://server2/live", "key": "key2" }
  ],
  "standbyImage": "standby.jpg",
  "videoSettings": { "bitrate": "2500k", "fps": 30 },
  "audioSettings": { "bitrate": "128k", "sampleRate": 44100 }
}

// コンテンツ切り替え
POST /api/stream/content/switch
{
  "fileId": "file123",
  "transition": {
    "type": "fade",
    "duration": 1.0
  }
}
```

### 7. UI/UX設計

#### Streamsページ拡張

```javascript
// 配信設定セクション
<DualRTMPConfig>
  <RTMPEndpoint1 />
  <RTMPEndpoint2 />
  <StandbyImageUpload />
</DualRTMPConfig>

// 配信制御パネル
<SessionControl>
  <StartButton disabled={!configured} />
  <StopButton disabled={!active} />
  <StatusIndicator state={sessionState} />
</SessionControl>

// コンテンツ制御パネル
<ContentControl>
  <FileSelectButton />
  <IdleButton />
  <TransitionSettings />
</ContentControl>
```

#### LocalFiles/GoogleDriveページ拡張

```javascript
// ファイルカード拡張
<FileCard>
  <ThumbnailImage />
  <FileInfo />
  <ActionButtons>
    <StreamButton disabled={!activeSession} onClick={() => switchToFile(fileId)} />
  </ActionButtons>
</FileCard>
```

## 実装計画

### フェーズ1: バックエンド基盤構築

**期間**: 3-4日

1. **PersistentStreamService開発**

   - セッション状態管理
   - デュアルRTMP対応
   - 再接続ロジック実装

2. **新API実装**

   - セッション管理エンドポイント
   - コンテンツ制御エンドポイント
   - 設定管理エンドポイント

3. **FFmpeg統合**
   - 動的入力切り替え
   - マルチ出力設定
   - エラーハンドリング強化

### フェーズ2: フロントエンド開発

**期間**: 2-3日

1. **Streamsページ改修**

   - デュアルRTMP設定UI
   - セッション制御パネル
   - リアルタイム状態表示

2. **ファイルページ統合**

   - アクティブセッション検出
   - "配信に送る"ボタン追加
   - ファイル選択フロー改善

3. **状態管理強化**
   - セッション状態のリアルタイム同期
   - エラー表示・復旧UI

### フェーズ3: 高度機能実装

**期間**: 2-3日

1. **トランジション効果**

   - フェード効果実装
   - 外部アニメーション対応
   - カスタムトランジション

2. **静止画管理システム**

   - アップロード機能
   - 画像処理・最適化
   - プレビュー機能

3. **監視・復旧システム**
   - 接続状態監視
   - 自動再接続
   - ログ・診断機能

## 技術検討事項

### FFmpeg複雑性

- 動的入力切り替えの安定性
- メモリ使用量の最適化
- エラー時の復旧戦略

### パフォーマンス

- 同時デュアル配信の負荷
- ファイル切り替え時の遅延
- 大容量ファイル処理

### エラーハンドリング

- 片方のエンドポイント失敗時の継続
- ネットワーク断続時の対応
- FFmpegプロセス異常終了時の復旧

## 成功指標

- [ ] デュアルRTMP配信の安定動作
- [ ] セッション開始から10分以上の継続配信
- [ ] ファイル切り替え時の断絶時間1秒以内
- [ ] 再接続成功率90%以上
- [ ] UI応答性の維持

## 今後の拡張可能性

- **マルチストリーム対応**: 3つ以上のエンドポイント
- **ライブ入力**: Webカメラ・画面キャプチャ
- **高度なトランジション**: ワイプ・スライド等
- **スケジューリング**: 時間指定でのコンテンツ切り替え
- **統計・分析**: 配信品質監視・レポート機能
