const express = require('express');

const router = express.Router();
const streamService = require('../services/streamService');

// RTMP publish開始時の通知を受信
router.post('/on_publish', async (req, res) => {
  try {
    const { name: streamKey, addr: clientIP, app } = req.body;

    console.log(`RTMP Publish started - Stream: ${streamKey}, IP: ${clientIP}, App: ${app}`);

    // 新しいセッションを記録
    await streamService.recordRtmpSession({
      streamKey,
      clientIP,
      app,
      action: 'publish_start',
      timestamp: new Date().toISOString(),
    });

    // 少し待機してから既存ストリームをチェック（新しく開始されたストリームを保護）
    setTimeout(async () => {
      try {
        // 5秒以上前に開始されたストリームのみ終了対象とする
        await streamService.terminateOldStreams(streamKey, 5000);
      } catch (error) {
        console.error('Error in delayed stream termination:', error);
      }
    }, 2000); // 2秒待機

    // 200レスポンスで許可
    res.status(200).send('OK');
  } catch (error) {
    console.error('RTMP on_publish error:', error);
    res.status(200).send('OK'); // RTMPサーバーには200を返す
  }
});

// RTMP publish終了時の通知を受信
router.post('/on_publish_done', async (req, res) => {
  try {
    const { name: streamKey, addr: clientIP, app } = req.body;

    console.log(`RTMP Publish ended - Stream: ${streamKey}, IP: ${clientIP}, App: ${app}`);

    // セッション終了を記録
    await streamService.recordRtmpSession({
      streamKey,
      clientIP,
      app,
      action: 'publish_end',
      timestamp: new Date().toISOString(),
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('RTMP on_publish_done error:', error);
    res.status(200).send('OK'); // RTMPサーバーには200を返す
  }
});

// RTMP play開始時の通知を受信（OBS等のクライアント）
router.post('/on_play', async (req, res) => {
  try {
    const { name: streamKey, addr: clientIP, app } = req.body;

    console.log(`RTMP Play started - Stream: ${streamKey}, IP: ${clientIP}, App: ${app}`);

    // プレイセッションを記録
    await streamService.recordRtmpSession({
      streamKey,
      clientIP,
      app,
      action: 'play_start',
      timestamp: new Date().toISOString(),
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('RTMP on_play error:', error);
    res.status(200).send('OK');
  }
});

// RTMP play終了時の通知を受信
router.post('/on_play_done', async (req, res) => {
  try {
    const { name: streamKey, addr: clientIP, app } = req.body;

    console.log(`RTMP Play ended - Stream: ${streamKey}, IP: ${clientIP}, App: ${app}`);

    // プレイセッション終了を記録
    await streamService.recordRtmpSession({
      streamKey,
      clientIP,
      app,
      action: 'play_end',
      timestamp: new Date().toISOString(),
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('RTMP on_play_done error:', error);
    res.status(200).send('OK');
  }
});

// RTMP セッション情報の取得
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await streamService.getRtmpSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Error getting RTMP sessions:', error);
    res.status(500).json({ error: 'RTMPセッション情報の取得に失敗しました' });
  }
});

// 特定のストリームキーのセッションを強制終了
router.post('/terminate/:streamKey', async (req, res) => {
  try {
    const { streamKey } = req.params;
    await streamService.terminateExistingStreams(streamKey);
    res.json({ message: `Stream ${streamKey} terminated successfully` });
  } catch (error) {
    console.error('Error terminating stream:', error);
    res.status(500).json({ error: 'ストリームの終了に失敗しました' });
  }
});

module.exports = router;
