const express = require('express');
const router = express.Router();
const streamService = require('../services/streamService');

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
    const {
      fileId,
      rtmpUrl,
      streamKey,
      format = 'rtmp',  // rtmp または srt
      videoSettings = {
        codec: 'libx264',
        bitrate: '2500k',
        framerate: 30,
        width: 1280,
        height: 720
      },
      audioSettings = {
        codec: 'aac',
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2
      }
    } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'ファイルIDが必要です' });
    }

    if (!rtmpUrl) {
      return res.status(400).json({ error: 'RTMP/SRT URLが必要です' });
    }

    // Google DriveのファイルIDの場合の処理
    const isGoogleDriveFile = typeof fileId === 'string' && fileId.match(/^[a-zA-Z0-9_-]{28,}$/);
    
    const streamData = {
      fileId,
      rtmpUrl,
      streamKey,
      format,
      videoSettings,
      audioSettings,
      isGoogleDriveFile
    };

    const stream = await streamService.startStream(streamData);
    res.status(200).json(stream);
  } catch (error) {
    next(error);
  }
});

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