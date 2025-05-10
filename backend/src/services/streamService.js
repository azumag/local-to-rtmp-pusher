const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const fetch = require('node-fetch');
const fileService = require('./fileService');
const { generateUniqueId, getCacheDir, fileExists } = require('../utils/fileUtils');

// ストリーム情報の保存先
const STREAMS_DB_PATH = path.join(getCacheDir(), 'streams.json');

// アクティブなFFmpegプロセスを保持するオブジェクト
const activeStreams = {};

// RTMPサーバーURL（デフォルト）
const defaultRtmpServer = process.env.RTMP_SERVER || 'rtmp://rtmp-server:1935/live';

// ストリームDBの初期化
const initializeStreamDb = async () => {
  if (!await fileExists(STREAMS_DB_PATH)) {
    await fs.writeJSON(STREAMS_DB_PATH, { streams: [] });
  }
  return await fs.readJSON(STREAMS_DB_PATH);
};

/**
 * アクティブなストリーム一覧の取得
 * @returns {Promise<Array>} ストリーム一覧
 */
const listActiveStreams = async () => {
  try {
    const db = await initializeStreamDb();
    // アクティブなストリームのみをフィルタリング
    return db.streams.filter(stream => stream.status === 'active');
  } catch (error) {
    console.error(`Error listing active streams: ${error.message}`);
    throw new Error('アクティブなストリーム一覧の取得に失敗しました');
  }
};

/**
 * ストリーム情報の保存
 * @param {Object} streamData - ストリーム情報
 * @returns {Promise<Object>} 保存されたストリーム情報
 */
const saveStreamInfo = async (streamData) => {
  try {
    const db = await initializeStreamDb();
    
    let existingStream = null;
    if (streamData.id) {
      existingStream = db.streams.find(s => s.id === streamData.id);
    }
    
    if (existingStream) {
      // 既存のストリーム情報を更新
      Object.assign(existingStream, streamData);
      existingStream.updatedAt = new Date().toISOString();
    } else {
      // 新しいストリーム情報を追加
      const streamId = generateUniqueId();
      const newStream = {
        id: streamId,
        ...streamData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.streams.push(newStream);
      existingStream = newStream;
    }
    
    await fs.writeJSON(STREAMS_DB_PATH, db);
    return existingStream;
  } catch (error) {
    console.error(`Error saving stream info: ${error.message}`);
    throw new Error('ストリーム情報の保存に失敗しました');
  }
};

/**
 * ストリーム情報の取得
 * @param {string} streamId - ストリームID
 * @returns {Promise<Object|null>} ストリーム情報
 */
const getStreamInfo = async (streamId) => {
  try {
    const db = await initializeStreamDb();
    return db.streams.find(s => s.id === streamId) || null;
  } catch (error) {
    console.error(`Error getting stream info: ${error.message}`);
    throw new Error('ストリーム情報の取得に失敗しました');
  }
};

/**
 * ストリームのステータス取得
 * @param {string} streamId - ストリームID
 * @returns {Promise<Object|null>} ストリームステータス
 */
const getStreamStatus = async (streamId) => {
  try {
    const streamInfo = await getStreamInfo(streamId);
    
    if (!streamInfo) {
      return null;
    }
    
    const isActive = !!activeStreams[streamId];
    
    return {
      id: streamId,
      status: isActive ? 'active' : 'inactive',
      startedAt: streamInfo.startedAt,
      duration: streamInfo.startedAt ? 
        Math.floor((Date.now() - new Date(streamInfo.startedAt).getTime()) / 1000) : 0,
      ...streamInfo
    };
  } catch (error) {
    console.error(`Error getting stream status: ${error.message}`);
    throw new Error('ストリームステータスの取得に失敗しました');
  }
};

/**
 * RTMPサーバー情報の取得
 * @returns {Promise<Object>} RTMPサーバー情報
 */
const getRtmpServerInfo = async () => {
  try {
    return {
      defaultServer: defaultRtmpServer,
      status: 'online',
      activeStreams: Object.keys(activeStreams).length
    };
  } catch (error) {
    console.error(`Error getting RTMP server info: ${error.message}`);
    throw new Error('RTMPサーバー情報の取得に失敗しました');
  }
};

/**
 * ストリームの開始
 * @param {Object} streamData - ストリーム設定
 * @returns {Promise<Object>} ストリーム情報
 */
const startStream = async (streamData) => {
  try {
    const { fileId, rtmpUrl, streamKey, format, videoSettings, audioSettings, isGoogleDriveFile } = streamData;
    
    // ファイル情報を取得
    let fileInfo = null;
    let inputPath = null;
    
    if (isGoogleDriveFile) {
      // Google Driveファイルの場合は別のサービスで処理
      const googleDriveService = require('./googleDriveService');
      const downloadInfo = await googleDriveService.downloadFile(fileId);
      inputPath = downloadInfo.localPath;
      fileInfo = {
        originalName: downloadInfo.filename,
        type: 'video',
        size: downloadInfo.size || 0
      };
    } else {
      fileInfo = await fileService.getFileInfo(fileId);
      
      if (!fileInfo) {
        throw new Error('指定されたファイルが見つかりません');
      }
      
      inputPath = fileInfo.path;
    }
    
    if (!inputPath || !await fileExists(inputPath)) {
      throw new Error('ファイルが見つかりません');
    }
    
    // 出力URLの作成
    const outputUrl = streamKey ? 
      `${rtmpUrl}/${streamKey}` : 
      rtmpUrl;
    
    // ストリームIDの生成
    const streamId = generateUniqueId();
    
    // FFmpegコマンドの構築
    let command = ffmpeg(inputPath);
    
    // ビデオ設定
    command = command
      .videoCodec(videoSettings.codec)
      .videoBitrate(videoSettings.bitrate)
      .fps(videoSettings.framerate)
      .size(`${videoSettings.width}x${videoSettings.height}`);
    
    // オーディオ設定
    command = command
      .audioCodec(audioSettings.codec)
      .audioBitrate(audioSettings.bitrate)
      .audioFrequency(audioSettings.sampleRate)
      .audioChannels(audioSettings.channels);
    
    // フォーマット設定
    if (format === 'srt') {
      // SRTの場合はmpegts形式でエンコード
      command = command.format('mpegts');
    } else {
      // RTMPの場合はflv形式でエンコード
      command = command.format('flv');
    }
    
    // ログハンドラの設定
    const logFile = path.join(getCacheDir('logs'), `stream-${streamId}.log`);
    const logStream = fs.createWriteStream(logFile);
    
    command
      .on('start', (commandLine) => {
        console.log(`Stream started: ${streamId}`);
        console.log(`Command: ${commandLine}`);
        logStream.write(`Started: ${new Date().toISOString()}\n`);
        logStream.write(`Command: ${commandLine}\n`);
      })
      .on('progress', (progress) => {
        logStream.write(`Progress: ${JSON.stringify(progress)}\n`);
      })
      .on('end', async () => {
        console.log(`Stream ended: ${streamId}`);
        logStream.write(`Ended: ${new Date().toISOString()}\n`);
        logStream.end();
        
        // ストリーム情報の更新
        const streamInfo = await getStreamInfo(streamId);
        if (streamInfo) {
          await saveStreamInfo({
            ...streamInfo,
            status: 'completed',
            endedAt: new Date().toISOString()
          });
        }
        
        // アクティブなストリームから削除
        delete activeStreams[streamId];
      })
      .on('error', async (err) => {
        console.error(`Stream error: ${streamId}`, err);
        logStream.write(`Error: ${err.message}\n`);
        logStream.end();
        
        // ストリーム情報の更新
        const streamInfo = await getStreamInfo(streamId);
        if (streamInfo) {
          await saveStreamInfo({
            ...streamInfo,
            status: 'error',
            errorMessage: err.message,
            endedAt: new Date().toISOString()
          });
        }
        
        // アクティブなストリームから削除
        delete activeStreams[streamId];
      });
    
    // ストリーム開始
    command.save(outputUrl);
    
    // アクティブなストリームに追加
    activeStreams[streamId] = {
      command,
      logStream,
      startedAt: new Date().toISOString()
    };
    
    // ストリーム情報の保存
    const streamInfo = await saveStreamInfo({
      id: streamId,
      fileId,
      fileName: fileInfo.originalName,
      rtmpUrl,
      streamKey,
      format,
      videoSettings,
      audioSettings,
      outputUrl,
      status: 'active',
      startedAt: new Date().toISOString(),
      logFile
    });
    
    return streamInfo;
  } catch (error) {
    console.error(`Error starting stream: ${error.message}`);
    throw new Error(`ストリームの開始に失敗しました: ${error.message}`);
  }
};

/**
 * ストリームの停止
 * @param {string} streamId - ストリームID
 * @returns {Promise<boolean>} 停止が成功したかどうか
 */
const stopStream = async (streamId) => {
  try {
    const activeStream = activeStreams[streamId];
    
    if (!activeStream) {
      const streamInfo = await getStreamInfo(streamId);
      if (!streamInfo) {
        throw new Error('指定されたストリームが見つかりません');
      }
      
      if (streamInfo.status === 'completed' || streamInfo.status === 'error') {
        return true;
      }
      
      await saveStreamInfo({
        ...streamInfo,
        status: 'stopped',
        endedAt: new Date().toISOString()
      });
      
      return true;
    }
    
    // FFmpegプロセスの停止
    if (activeStream.command) {
      activeStream.command.kill('SIGKILL');
    }
    
    // ログストリームの終了
    if (activeStream.logStream) {
      activeStream.logStream.end();
    }
    
    // ストリーム情報の更新
    const streamInfo = await getStreamInfo(streamId);
    if (streamInfo) {
      await saveStreamInfo({
        ...streamInfo,
        status: 'stopped',
        endedAt: new Date().toISOString()
      });
    }
    
    // アクティブなストリームから削除
    delete activeStreams[streamId];
    
    return true;
  } catch (error) {
    console.error(`Error stopping stream: ${error.message}`);
    throw new Error('ストリームの停止に失敗しました');
  }
};

module.exports = {
  listActiveStreams,
  getStreamInfo,
  getStreamStatus,
  getRtmpServerInfo,
  startStream,
  stopStream
};