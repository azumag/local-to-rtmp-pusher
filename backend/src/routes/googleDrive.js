const express = require('express');
const { createLogger, format: winstonFormat, transports } = require('winston');

const router = express.Router();
const googleDriveService = require('../services/googleDriveService');

// テスト用のシンプルなルート
router.get('/test', (req, res) => {
  console.log('TEST ROUTE HIT!');
  console.error('TEST ROUTE ERROR LOG');
  res.json({ message: 'Test route working', timestamp: new Date().toISOString() });
});

// ロガーを設定（シンプルなフォーマット）
const logger = createLogger({
  level: 'info',
  format: winstonFormat.combine(
    winstonFormat.timestamp(),
    winstonFormat.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [new transports.Console()],
});

// Google Driveの共有URLからファイル一覧を取得
router.post('/list', (req, res, next) => {
  // 複数の方法でログ出力を試す
  console.log('CONSOLE: Google Drive endpoint hit');
  console.error('CONSOLE.ERROR: Google Drive endpoint hit');
  process.stdout.write('STDOUT: Google Drive endpoint hit\n');
  logger.info('LOGGER: Google Drive endpoint hit');

  console.log('Request body:', JSON.stringify(req.body));

  const handleRequest = async () => {
    try {
      const { shareUrl } = req.body;
      logger.info(`Processing shareUrl: ${shareUrl}`);

      if (!shareUrl) {
        logger.warn('No shareUrl provided in request');
        return res.status(400).json({ error: 'Google Driveの共有URLが必要です' });
      }

      logger.info('ShareUrl received, calling service...');
      const files = await googleDriveService.listFilesFromShareUrl(shareUrl);
      logger.info(`Service returned ${files.length} files`);

      res.status(200).json(files);
      logger.info('Response sent successfully');
    } catch (error) {
      logger.error('Error in Google Drive list handler');
      logger.error(`Error message: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      next(error);
    }
  };

  handleRequest();
});

// Google DriveのファイルIDからファイル情報を取得
router.get('/file/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const fileInfo = await googleDriveService.getFileInfo(fileId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    res.status(200).json(fileInfo);
  } catch (error) {
    next(error);
  }
});

// Google Driveのファイルをキャッシュにダウンロード
router.post('/download', async (req, res, next) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'ファイルIDが必要です' });
    }

    const downloadInfo = await googleDriveService.downloadFile(fileId);
    res.status(200).json(downloadInfo);
  } catch (error) {
    next(error);
  }
});

// Google Driveのファイルをダウンロードして直接ストリーミング
router.post('/stream', async (req, res, next) => {
  try {
    const {
      fileId,
      rtmpUrl,
      streamKey,
      format = 'rtmp',
      videoSettings = {
        codec: 'libx264',
        bitrate: '2500k',
        framerate: 30,
        width: 1280,
        height: 720,
      },
      audioSettings = {
        codec: 'aac',
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2,
      },
    } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'ファイルIDが必要です' });
    }

    if (!rtmpUrl) {
      return res.status(400).json({ error: 'RTMP/SRT URLが必要です' });
    }

    const streamData = {
      fileId,
      rtmpUrl,
      streamKey,
      format,
      videoSettings,
      audioSettings,
    };

    const stream = await googleDriveService.streamFile(streamData);
    res.status(200).json(stream);
  } catch (error) {
    next(error);
  }
});

// Google Driveの共有URLからフォルダIDを抽出
router.post('/extract-folder-id', async (req, res, next) => {
  try {
    const { shareUrl } = req.body;

    if (!shareUrl) {
      return res.status(400).json({ error: 'Google Driveの共有URLが必要です' });
    }

    const folderId = await googleDriveService.extractFolderId(shareUrl);
    res.status(200).json({ folderId });
  } catch (error) {
    next(error);
  }
});

// ダウンロードの状態を確認
router.get('/download/:fileId/status', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const status = await googleDriveService.getDownloadStatus(fileId);

    if (!status) {
      return res.status(404).json({ error: 'ダウンロード情報が見つかりません' });
    }

    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
