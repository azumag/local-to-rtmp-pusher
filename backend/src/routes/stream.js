const express = require('express');
const router = express.Router();
const streamService = require('../services/streamService');
const fileService = require('../services/fileService');
const googleDriveService = require('../services/googleDriveService');
const fs = require('fs');
const logger = require('../utils/logger');

// アクティブなストリームリストの取得
router.get('/', async (req, res, next) => {
  try {
    const streams = await streamService.listActiveStreams();
    res.status(200).json(streams);
  } catch (error) {
    next(error);
  }
});

// ストリーム開始
router.post('/start', async (req, res, next) => {
  try {
    logger.info('ストリーム開始APIにリクエストが到達しました');
    logger.info('リクエストボディ:', req.body);
    
    const { fileId, rtmpUrl, streamKey, format, videoSettings, audioSettings } = req.body;
    
    logger.info(`取得したファイルID: ${fileId}`); // 追加：ファイルIDのログ
    
    if (!fileId) {
      logger.error('ファイルIDが提供されていません');
      return res.status(400).json({ error: 'ファイルIDが必要です' });
    }
    
    if (!rtmpUrl) {
      logger.error('RTMP URLが提供されていません');
      return res.status(400).json({ error: 'RTMPまたはSRT URLが必要です' });
    }
    
    // ファイル情報の取得
    logger.info(`ファイル情報を取得中: fileId=${fileId}`);
    const fileInfo = await fileService.getFileById(fileId);
    
    if (!fileInfo) {
      logger.error(`ファイルが見つかりません: fileId=${fileId}`);
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    
    logger.info(`取得したファイル情報: ${JSON.stringify(fileInfo)}`);
    
    logger.info(`ストリーミング開始: ${fileInfo.originalName}`);
    
    // ファイルのタイプを確認（ファイルパスがあるかどうかで判断）
    const isLocalFile = fileInfo.path && fs.existsSync(fileInfo.path);
    const isGoogleDriveFile = fileInfo.googleDriveId;
    
    // ストリーミングソースの設定
    let inputFile;
    
    if (isLocalFile) {
      logger.info(`ローカルファイルストリーム: ${fileInfo.path}`);
      inputFile = fileInfo.path;
    } else if (isGoogleDriveFile) {
      logger.info(`Google Driveファイルストリーム: ${fileInfo.googleDriveId}`);
      try {
        // Google Driveからファイルをダウンロード
        inputFile = await googleDriveService.downloadFile(fileInfo.googleDriveId);
      } catch (error) {
        logger.error(`Google Driveファイルのダウンロードに失敗: ${error.message}`);
        return res.status(500).json({ error: `Google Driveファイルのダウンロードに失敗しました: ${error.message}` });
      }
    } else {
      logger.error('不明なファイルタイプ');
      return res.status(400).json({ error: 'ファイルタイプが不明です' });
    }
    
    // ファイル情報取得後にデバッグ情報を出力
    logger.info(`ファイル情報: ${JSON.stringify(fileInfo)}`);
    
    // FFmpegコマンドの構築と実行
    try {
      const streamData = await startStreamingProcess(fileId, inputFile, fileInfo, rtmpUrl, streamKey, format, videoSettings, audioSettings, isGoogleDriveFile);
      res.status(200).json(streamData);
    } catch (error) {
      logger.error(`ストリーム開始失敗: ${error.message}`);
      res.status(500).json({ error: `ストリーム開始に失敗しました: ${error.message}` });
    }
  } catch (error) {
    logger.error(`ストリーミングエラー: ${error.message}`);
    next(error);
  }
});

/**
 * FFmpegを使用したストリーミングプロセスを開始する関数
 * @param {string} inputFile 入力ファイルのパス
 * @param {string} fileId ファイルID
 * @param {Object} fileInfo ファイル情報のオブジェクト
 * @param {string} rtmpUrl RTMP/SRT配信先URL
 * @param {string} [streamKey] ストリームキー（省略可能）
 * @param {string} [format] 出力フォーマット（省略可能）
 * @param {Object} [videoSettings] ビデオエンコード設定（省略可能）
 * @param {Object} [audioSettings] オーディオエンコード設定（省略可能）
 * @param {boolean} [isGoogleDriveFile] Google Driveファイルかどうかのフラグ
 * @returns {Promise<Object>} ストリーム情報
 */
async function startStreamingProcess(fileId, inputFile, fileInfo, rtmpUrl, streamKey, format, videoSettings, audioSettings, isGoogleDriveFile) {
  // 出力ストリームURLの構築
  let streamUrl = rtmpUrl;
  if (streamKey) {
    // RTMPの場合、URLとストリームキーを結合
    streamUrl = `${rtmpUrl}/${streamKey}`;
  }

  logger.info(`ストリーム出力先URL: ${streamUrl}`);

  // ビデオとオーディオの設定オブジェクト
  const ffmpegOptions = {
    fileId,
    input: inputFile,
    output: streamUrl,
    videoSettings: videoSettings || {
      codec: 'libx264',
      bitrate: '2500k',
      fps: 30,
      preset: 'veryfast'
    },
    audioSettings: audioSettings || {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100
    },
    format: format || 'flv', // RTMPのデフォルトフォーマット
    isGoogleDriveFile,
    rtmpUrl,
    streamKey,
  };

  logger.info(`FFmpegオプション: ${JSON.stringify(ffmpegOptions)}`);

  // streamServiceを使用してストリームを開始
  const stream = await streamService.startStream(ffmpegOptions);
  
  logger.info(`ストリーム開始成功: streamId=${stream.id}`);
  
  // ストリーム情報を返却
  return {
    streamId: stream.id,
    status: 'streaming',
    startTime: stream.startTime,
    inputFile: fileInfo.originalName,
    outputUrl: streamUrl
  };
}

// ストリーム停止
router.post('/stop/:streamId', async (req, res, next) => {
  try {
    const streamId = req.params.streamId;
    await streamService.stopStream(streamId);
    res.status(200).json({ message: 'ストリームが正常に停止しました' });
  } catch (error) {
    next(error);
  }
});

// ストリーム情報の取得
router.get('/:streamId', async (req, res, next) => {
  try {
    const streamId = req.params.streamId;
    const streamInfo = await streamService.getStreamInfo(streamId);
    
    if (!streamInfo) {
      return res.status(404).json({ error: 'ストリームが見つかりません' });
    }
    
    res.status(200).json(streamInfo);
  } catch (error) {
    next(error);
  }
});

// ストリームステータスの取得
router.get('/:streamId/status', async (req, res, next) => {
  try {
    const streamId = req.params.streamId;
    const status = await streamService.getStreamStatus(streamId);
    
    if (!status) {
      return res.status(404).json({ error: 'ストリームが見つかりません' });
    }
    
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

// RTMP/SRTサーバー情報の取得
router.get('/server/info', async (req, res, next) => {
  try {
    const serverInfo = await streamService.getRtmpServerInfo();
    res.status(200).json(serverInfo);
  } catch (error) {
    next(error);
  }
});

module.exports = router;