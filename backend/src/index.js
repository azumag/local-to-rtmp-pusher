const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createLogger, format, transports } = require('winston');
const fs = require('fs-extra');
const path = require('path');

// 環境変数の設定
require('dotenv').config();

// ロガーの設定
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
  ],
});

// アプリの初期化
const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '../cache');

// キャッシュディレクトリの確認と作成
fs.ensureDirSync(CACHE_DIR);
logger.info(`Cache directory set to: ${CACHE_DIR}`);

// ミドルウェアの設定
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ファイルアップロード用に明示的にファイルサイズ制限を設定
app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ extended: true, limit: '1024mb' }));

// APIルートの読み込み
const fileRoutes = require('./routes/files');
const streamRoutes = require('./routes/stream');
const googleDriveRoutes = require('./routes/googleDrive');

// ルートの設定
app.use('/api/files', fileRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/google-drive', googleDriveRoutes);

// 基本的なヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// エラーハンドリング
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500,
    },
  });
});

// サーバーの起動
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// グレースフルシャットダウンの処理
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // アクティブなFFmpegプロセスの終了処理などをここに記述
  process.exit(0);
});

module.exports = app;
