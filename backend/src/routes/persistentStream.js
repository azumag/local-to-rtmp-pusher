const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { PersistentStreamService, SESSION_STATES } = require('../services/persistentStreamService');
const logger = require('../utils/logger');
const { getCacheDir } = require('../utils/fileUtils');

const router = express.Router();

// PersistentStreamServiceのインスタンス化
const persistentStreamService = new PersistentStreamService();

// Multer設定（静止画アップロード用）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('対応していないファイル形式です。JPEG, PNG, GIFのみ対応しています。'));
    }
  },
});

// RTMP設定の保存先
const RTMP_CONFIG_PATH = path.join(getCacheDir(), 'rtmp-config.json');

/**
 * RTMP設定の初期化
 */
const initializeRtmpConfig = async () => {
  try {
    if (!(await fs.pathExists(RTMP_CONFIG_PATH))) {
      const defaultConfig = {
        endpoints: [
          {
            name: 'Primary RTMP',
            url: '',
            streamKey: '',
            enabled: false,
            // Optional per-endpoint encoding settings
            // If not specified, global settings will be used
            videoSettings: null,
            audioSettings: null,
          },
          {
            name: 'Secondary RTMP',
            url: '',
            streamKey: '',
            enabled: false,
            // Optional per-endpoint encoding settings
            // If not specified, global settings will be used
            videoSettings: null,
            audioSettings: null,
          },
        ],
        videoSettings: {
          codec: 'libx264',
          bitrate: '2500k',
          width: 1920,
          height: 1080,
          fps: 30,
        },
        audioSettings: {
          codec: 'aac',
          bitrate: '128k',
          sampleRate: 44100,
          channels: 2,
        },
      };
      await fs.writeJSON(RTMP_CONFIG_PATH, defaultConfig);
    }
    return await fs.readJSON(RTMP_CONFIG_PATH);
  } catch (error) {
    logger.error(`Error initializing RTMP config: ${error.message}`);
    throw error;
  }
};

// ==================== セッション管理API ====================

/**
 * 配信セッション開始
 * POST /api/stream/session/start
 */
router.post('/session/start', async (req, res, next) => {
  try {
    logger.info('Starting persistent streaming session');

    const { endpoints, standbyImage, videoSettings, audioSettings, sessionName } = req.body;

    // バリデーション
    if (!endpoints || !Array.isArray(endpoints)) {
      return res.status(400).json({
        error: 'エンドポイント設定が必要です',
      });
    }

    const activeEndpoints = endpoints.filter((ep) => ep.enabled);
    if (activeEndpoints.length === 0) {
      return res.status(400).json({
        error: '少なくとも1つのRTMPエンドポイントを有効にしてください',
      });
    }

    // RTMPエンドポイントのバリデーション
    for (const endpoint of activeEndpoints) {
      if (!endpoint.url || !endpoint.url.startsWith('rtmp://')) {
        return res.status(400).json({
          error: '有効なRTMP URLを指定してください',
        });
      }
    }

    const sessionConfig = {
      endpoints: activeEndpoints,
      standbyImage,
      videoSettings: videoSettings || {},
      audioSettings: audioSettings || {},
      sessionName: sessionName || 'Default Session',
    };

    const session = await persistentStreamService.startSession(sessionConfig);

    logger.info(`Persistent session started: ${session.id}`);
    res.status(200).json(session);
  } catch (error) {
    logger.error(`Error starting session: ${error.message}`);
    next(error);
  }
});

/**
 * 配信セッション停止
 * POST /api/stream/session/stop/:sessionId
 */
router.post('/session/stop/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    logger.info(`Stopping persistent session: ${sessionId}`);

    const result = await persistentStreamService.stopSession(sessionId);

    if (result) {
      logger.info(`Session stopped successfully: ${sessionId}`);
      res.status(200).json({
        message: 'セッションが正常に停止しました',
        sessionId,
      });
    } else {
      res.status(404).json({
        error: '指定されたセッションが見つかりません',
      });
    }
  } catch (error) {
    logger.error(`Error stopping session: ${error.message}`);
    next(error);
  }
});

/**
 * セッション状態取得
 * GET /api/stream/session/status/:sessionId
 */
router.get('/session/status/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const status = await persistentStreamService.getSessionStatus(sessionId);

    if (!status) {
      return res.status(404).json({
        error: 'セッションが見つかりません',
      });
    }

    res.status(200).json(status);
  } catch (error) {
    logger.error(`Error getting session status: ${error.message}`);
    next(error);
  }
});

/**
 * アクティブセッション一覧取得
 * GET /api/stream/session/active
 */
router.get('/session/active', async (req, res, next) => {
  try {
    const activeSessions = persistentStreamService.getActiveSessions();
    res.status(200).json(activeSessions);
  } catch (error) {
    logger.error(`Error getting active sessions: ${error.message}`);
    next(error);
  }
});

// ==================== コンテンツ制御API ====================

/**
 * ファイル切り替え
 * POST /api/stream/content/switch
 */
router.post('/content/switch', async (req, res, next) => {
  try {
    const { sessionId, fileId, isGoogleDriveFile = false } = req.body;

    logger.info(`Switching content for session ${sessionId} to file ${fileId}`);

    if (!sessionId || !fileId) {
      return res.status(400).json({
        error: 'セッションIDとファイルIDが必要です',
      });
    }

    const result = await persistentStreamService.switchToFile(sessionId, fileId, isGoogleDriveFile);

    logger.info(`Content switched successfully for session ${sessionId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error switching content: ${error.message}`);
    next(error);
  }
});

/**
 * 静止画に戻る
 * POST /api/stream/content/idle
 */
router.post('/content/idle', async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    logger.info(`Switching session ${sessionId} to standby image`);

    if (!sessionId) {
      return res.status(400).json({
        error: 'セッションIDが必要です',
      });
    }

    const result = await persistentStreamService.switchToStandby(sessionId);

    logger.info(`Session ${sessionId} switched to standby successfully`);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error switching to standby: ${error.message}`);
    next(error);
  }
});

/**
 * 静止画アップロード
 * POST /api/stream/content/upload
 */
router.post('/content/upload', upload.single('image'), async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'セッションIDが必要です',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: '画像ファイルが必要です',
      });
    }

    logger.info(`Uploading standby image for session ${sessionId}: ${req.file.originalname}`);

    const result = await persistentStreamService.uploadStandbyImage(
      sessionId,
      req.file.buffer,
      req.file.originalname
    );

    logger.info(`Standby image uploaded successfully for session ${sessionId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error uploading standby image: ${error.message}`);
    next(error);
  }
});

// ==================== 設定管理API ====================

/**
 * RTMP設定保存
 * POST /api/stream/config/rtmp
 */
router.post('/config/rtmp', async (req, res, next) => {
  try {
    const { endpoints, videoSettings, audioSettings } = req.body;

    logger.info('Saving RTMP configuration');

    // バリデーション
    if (!endpoints || !Array.isArray(endpoints)) {
      return res.status(400).json({
        error: 'エンドポイント設定が必要です',
      });
    }

    const config = {
      endpoints,
      videoSettings: videoSettings || {},
      audioSettings: audioSettings || {},
      updatedAt: new Date().toISOString(),
    };

    await fs.writeJSON(RTMP_CONFIG_PATH, config);

    logger.info('RTMP configuration saved successfully');
    res.status(200).json({
      message: 'RTMP設定が保存されました',
      config,
    });
  } catch (error) {
    logger.error(`Error saving RTMP config: ${error.message}`);
    next(error);
  }
});

/**
 * RTMP設定取得
 * GET /api/stream/config/rtmp
 */
router.get('/config/rtmp', async (req, res, next) => {
  try {
    const config = await initializeRtmpConfig();
    res.status(200).json(config);
  } catch (error) {
    logger.error(`Error getting RTMP config: ${error.message}`);
    next(error);
  }
});

// ==================== システム情報API ====================

/**
 * セッション状態一覧
 * GET /api/stream/session/states
 */
router.get('/session/states', (req, res) => {
  res.status(200).json({
    states: SESSION_STATES,
    description: {
      [SESSION_STATES.DISCONNECTED]: '未接続',
      [SESSION_STATES.CONNECTING]: '接続中',
      [SESSION_STATES.CONNECTED]: '接続済み（静止画配信中）',
      [SESSION_STATES.STREAMING]: 'ファイル配信中',
      [SESSION_STATES.RECONNECTING]: '再接続中',
      [SESSION_STATES.ERROR]: 'エラー状態',
    },
  });
});

module.exports = router;
