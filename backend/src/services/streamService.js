const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const fileService = require('./fileService');
const { generateUniqueId, getCacheDir, fileExists } = require('../utils/fileUtils');

// ストリーム情報の保存先
const STREAMS_DB_PATH = path.join(getCacheDir(), 'streams.json');

// アクティブなFFmpegプロセスを保持するオブジェクト
const activeStreams = {};

// RTMPサーバーURL（デフォルト）
const defaultRtmpServer = process.env.RTMP_SERVER || 'rtmp://rtmp-server:1935/live';

// RTMPセッション情報の保存先
const RTMP_SESSIONS_DB_PATH = path.join(getCacheDir(), 'rtmp-sessions.json');

// アトミックなJSON書き込み用のユーティリティ
const writeJSONSafely = async (filePath, data) => {
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.writeJSON(tempPath, data);
    await fs.move(tempPath, filePath, { overwrite: true });
  } catch (error) {
    // テンポラリファイルをクリーンアップ
    try {
      await fs.remove(tempPath);
    } catch (cleanupError) {
      // クリーンアップエラーは無視
    }
    throw error;
  }
};

// ストリームDBの初期化
const initializeStreamDb = async () => {
  try {
    if (!(await fileExists(STREAMS_DB_PATH))) {
      await fs.writeJSON(STREAMS_DB_PATH, { streams: [] });
    }
    return await fs.readJSON(STREAMS_DB_PATH);
  } catch (error) {
    console.warn(`Failed to read streams.json, recreating: ${error.message}`);
    // JSONファイルが壊れている場合は新しく作成
    const defaultDb = { streams: [] };
    await writeJSONSafely(STREAMS_DB_PATH, defaultDb);
    return defaultDb;
  }
};

/**
 * アクティブなストリーム一覧の取得
 * @returns {Promise<Array>} ストリーム一覧
 */
const listActiveStreams = async () => {
  try {
    const db = await initializeStreamDb();
    // アクティブなストリームのみをフィルタリング
    return db.streams.filter((stream) => stream.status === 'active');
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
      existingStream = db.streams.find((s) => s.id === streamData.id);
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
        updatedAt: new Date().toISOString(),
      };
      db.streams.push(newStream);
      existingStream = newStream;
    }

    await writeJSONSafely(STREAMS_DB_PATH, db);
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
    return db.streams.find((s) => s.id === streamId) || null;
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
      duration: streamInfo.startedAt
        ? Math.floor((Date.now() - new Date(streamInfo.startedAt).getTime()) / 1000)
        : 0,
      ...streamInfo,
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
      activeStreams: Object.keys(activeStreams).length,
    };
  } catch (error) {
    console.error(`Error getting RTMP server info: ${error.message}`);
    throw new Error('RTMPサーバー情報の取得に失敗しました');
  }
};

/**
 * 既存のストリームを終了する
 * @param {string} streamIdentifier - ストリームキーまたは出力URL
 * @returns {Promise<boolean>} 終了が成功したかどうか
 */
const terminateExistingStreams = async (streamIdentifier) => {
  try {
    console.log(`Terminating existing streams for identifier: ${streamIdentifier}`);

    // アクティブなストリームの中から該当するものを探して終了
    let terminatedCount = 0;

    for (const [streamId, streamInfo] of Object.entries(activeStreams)) {
      try {
        const streamRecord = await getStreamInfo(streamId);
        if (
          streamRecord &&
          (streamRecord.streamKey === streamIdentifier ||
            streamRecord.outputUrl === streamIdentifier ||
            streamRecord.outputUrl?.includes(streamIdentifier) ||
            (streamIdentifier.includes('live') && streamRecord.outputUrl?.includes('live')))
        ) {
          console.log(`Terminating stream ${streamId} for identifier ${streamIdentifier}`);

          // FFmpegプロセスを強制終了
          if (streamInfo.command) {
            streamInfo.command.kill('SIGKILL');
          }

          // ログストリームを終了
          if (streamInfo.logStream) {
            streamInfo.logStream.end();
          }

          // ストリーム情報を更新（エラーを無視して続行）
          try {
            await saveStreamInfo({
              id: streamId,
              status: 'terminated',
              endedAt: new Date().toISOString(),
              terminationReason: `Terminated for new stream with identifier: ${streamIdentifier}`,
            });
          } catch (saveError) {
            console.error(`Error saving termination info for ${streamId}:`, saveError.message);
            // エラーを無視して続行
          }

          // アクティブストリームから削除
          delete activeStreams[streamId];
          terminatedCount += 1;
        }
      } catch (error) {
        console.error(`Error terminating stream ${streamId}:`, error);
      }
    }

    console.log(
      `Terminated ${terminatedCount} existing streams for identifier: ${streamIdentifier}`
    );
    return true;
  } catch (error) {
    console.error(`Error terminating existing streams: ${error.message}`);
    return false;
  }
};

/**
 * ストリームの開始
 * @param {Object} streamData - ストリーム設定
 * @returns {Promise<Object>} ストリーム情報
 */
const startStream = async (streamData) => {
  try {
    console.log('streamService.startStream 関数が開始されました');

    // FFmpegのチェックを追加
    try {
      const { execSync } = require('child_process');
      const ffmpegVersion = execSync('ffmpeg -version').toString().split('\n')[0];
      console.log('FFmpegバージョン情報:', ffmpegVersion);
    } catch (ffmpegError) {
      console.error('FFmpeg確認エラー:', ffmpegError.message);
    }

    console.log('streamData:', streamData); // 追加するログ

    const {
      fileId,
      rtmpUrl,
      streamKey,
      format,
      videoSettings,
      audioSettings,
      isGoogleDriveFile,
      input,
    } = streamData;

    // ファイル情報を取得
    let fileInfo = null;
    let inputPath = null;

    console.log('isGoogleDriveFile:', isGoogleDriveFile); // 追加するログ
    console.log('input parameter:', input); // 追加するログ

    if (isGoogleDriveFile && input) {
      // Google Driveファイルで既にダウンロード済みの場合
      inputPath = input;
      fileInfo = {
        originalName: `gdrive-${fileId}`,
        type: 'video',
        size: 0,
      };
      console.log('Using pre-downloaded Google Drive file:', inputPath);
    } else if (isGoogleDriveFile) {
      // Google Driveファイルの場合は別のサービスで処理
      const googleDriveService = require('./googleDriveService');
      const downloadInfo = await googleDriveService.downloadFile(fileId);
      inputPath = downloadInfo.localPath;
      fileInfo = {
        originalName: downloadInfo.filename,
        type: 'video',
        size: downloadInfo.size || 0,
      };
    } else {
      console.log('fileService.getFileById を呼び出す直前です。fileId:', fileId); // 修正：getFileInfoからgetFileByIdに変更
      fileInfo = await fileService.getFileById(fileId);
      console.log('fileService.getFileById 呼び出し後:', fileInfo); // 修正：getFileInfoからgetFileByIdに変更

      if (!fileInfo) {
        console.log('ファイル情報が見つかりません、fileId:', fileId);
        throw new Error('指定されたファイルが見つかりません');
      }

      console.log('fileInfo の詳細:', JSON.stringify(fileInfo, null, 2));
      inputPath = fileInfo.path;
      console.log('設定された inputPath:', inputPath);
    }

    console.log('fileExists を呼び出し前、inputPath:', inputPath);
    const inputFileExists = await fileExists(inputPath);
    console.log('fileExists(inputPath) の結果:', inputFileExists, '、パス:', inputPath);

    if (!inputPath) {
      console.log('inputPath が設定されていません');
      throw new Error('ファイルパスが設定されていません');
    }

    if (!inputFileExists) {
      console.log('ファイルが存在しません、パス:', inputPath);
      throw new Error(`ファイルが見つかりません: ${inputPath}`);
    }

    // 出力URLの作成
    const outputUrl = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;

    // 出力URLのフォーマットをログに出力（デバッグ用）
    console.log('生成された出力URL:', outputUrl);

    // 既存の同じストリームの接続があれば事前に終了
    // streamKeyが空の場合は、outputUrlを使って識別
    const streamIdentifier = streamKey || outputUrl;
    console.log(`Checking for existing streams with identifier: ${streamIdentifier}`);
    await terminateExistingStreams(streamIdentifier);
    // 少し待機して既存接続の終了を確実にする
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    // ストリームIDの生成
    const streamId = generateUniqueId();

    // ストリーム情報を先に保存
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
      status: 'preparing', // 準備中ステータス
      startedAt: new Date().toISOString(),
    });
    console.log('saveStreamInfo 呼び出し後:', streamInfo); // 追加するログ

    console.log('process.nextTick の直前まで到達しました'); // 追加するログ

    // FFmpegの初期化に関する情報を記録
    try {
      console.log('FFmpeg情報確認 - 入力ファイル:', inputPath);
      const stats = fs.statSync(inputPath);
      console.log('ファイルステータス:', {
        size: stats.size,
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8),
        lastModified: stats.mtime,
      });
    } catch (err) {
      console.error('ファイル情報取得エラー:', err.message);
    }

    // 残りの処理は非同期で実行
    process.nextTick(async () => {
      try {
        console.log('FFmpegプロセス開始 - ストリームID:', streamId);
        // FFmpegコマンドの構築
        const logFile = path.join(getCacheDir('logs'), `stream-${streamId}.log`);
        console.log('ログファイル設定:', logFile);

        try {
          // ログディレクトリの確認
          const logDir = path.dirname(logFile);
          if (!fs.existsSync(logDir)) {
            console.log('ログディレクトリが存在しないため作成します:', logDir);
            fs.mkdirSync(logDir, { recursive: true });
          }
        } catch (error) {
          console.error('ログディレクトリ作成エラー:', error.message);
        }

        const logStream = fs.createWriteStream(logFile);
        console.log('FFmpegコマンド初期化 - 入力ファイル:', inputPath);
        let command = ffmpeg(inputPath);

        // 内部プロパティ_argumentsへのアクセスを削除し、初期化完了のログに変更
        console.log('FFmpegコマンド初期化完了');

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
          command = command.format('mpegts');
        } else {
          command = command.format('flv');
        }

        // RTMP接続の改善オプションを追加
        if (format === 'rtmp') {
          command = command
            .addOption('-f', 'flv')
            .addOption('-flvflags', 'no_duration_filesize')
            .addOption('-reconnect', '1')
            .addOption('-reconnect_streamed', '1')
            .addOption('-reconnect_delay_max', '2')
            .addOption('-rtmp_live', 'live')
            .addOption('-rtmp_buffer', '1000')
            .addOption('-rtmp_flush_interval', '10');
        }

        // 出力URLの検証を追加
        console.log('出力先URL:', outputUrl);
        if (!outputUrl || !(outputUrl.startsWith('rtmp://') || outputUrl.startsWith('srt://'))) {
          throw new Error(`無効な出力URL: ${outputUrl}`);
        }

        // イベントハンドラ設定
        command
          .on('start', (commandLine) => {
            console.log(`Stream started: ${streamId}`);
            logStream.write(`Started: ${new Date().toISOString()}\n`);
            logStream.write(`Command: ${commandLine}\n`);

            // ステータスを「アクティブ」に更新
            saveStreamInfo({
              id: streamId,
              status: 'active',
              logFile,
            });
          })
          .on('progress', (progress) => {
            logStream.write(`Progress: ${JSON.stringify(progress)}\n`);
          })
          .on('end', async () => {
            console.log(`Stream ended: ${streamId}`);
            logStream.write(`Ended: ${new Date().toISOString()}\n`);
            logStream.end();

            await saveStreamInfo({
              id: streamId,
              status: 'completed',
              endedAt: new Date().toISOString(),
            });

            delete activeStreams[streamId];
          })
          .on('error', async (err) => {
            console.error(`Stream error: ${streamId}`, err);
            console.error('エラーの詳細:', err.message, JSON.stringify(err));

            // より詳細なエラー診断情報
            if (err.message.includes('Invalid output')) {
              console.error('出力先URLが無効です。形式を確認してください:', outputUrl);
            }

            logStream.write(`Error: ${err.message}\n`);
            if (err.stack) logStream.write(`Stack: ${err.stack}\n`);
            logStream.end();

            let errorMessage = err.message;

            // RTMPサーバー接続エラーの検出
            if (
              err.message.includes('Connection refused') ||
              err.message.includes('Connection timed out') ||
              err.message.includes('Failed to connect')
            ) {
              errorMessage = `RTMPサーバーに接続できません。URL設定を確認してください: ${err.message}`;
              console.error('RTMP接続エラー検出:', errorMessage);
            }

            // ファイルエラーの検出
            if (err.message.includes('No such file') || err.message.includes('Invalid data')) {
              errorMessage = `ファイルが無効または破損しています: ${err.message}`;
              console.error('ファイルエラー検出:', errorMessage);
            }

            await saveStreamInfo({
              id: streamId,
              status: 'error',
              errorMessage,
              errorDetail: err.message,
              endedAt: new Date().toISOString(),
            });

            delete activeStreams[streamId];
          });

        // ストリーム開始
        command.save(outputUrl);

        // アクティブなストリームに追加
        activeStreams[streamId] = {
          command,
          logStream,
          startedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error(`Error starting stream process: ${error.message}`);
        await saveStreamInfo({
          id: streamId,
          status: 'error',
          errorMessage: error.message,
          endedAt: new Date().toISOString(),
        });
      }
    });

    // 処理開始情報をすぐに返す
    return streamInfo;
  } catch (error) {
    console.error('streamService.startStream 関数でエラーが発生しました:', error); // 追加するログ
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
        endedAt: new Date().toISOString(),
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
        endedAt: new Date().toISOString(),
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

// RTMPセッションDBの初期化
const initializeRtmpSessionDb = async () => {
  try {
    if (!(await fileExists(RTMP_SESSIONS_DB_PATH))) {
      await writeJSONSafely(RTMP_SESSIONS_DB_PATH, { sessions: [] });
    }
    return await fs.readJSON(RTMP_SESSIONS_DB_PATH);
  } catch (error) {
    console.warn(`Failed to read rtmp-sessions.json, recreating: ${error.message}`);
    // JSONファイルが壊れている場合は新しく作成
    const defaultDb = { sessions: [] };
    await writeJSONSafely(RTMP_SESSIONS_DB_PATH, defaultDb);
    return defaultDb;
  }
};

/**
 * RTMPセッション情報の記録
 * @param {Object} sessionData - セッション情報
 * @returns {Promise<Object>} 保存されたセッション情報
 */
const recordRtmpSession = async (sessionData) => {
  try {
    const db = await initializeRtmpSessionDb();

    const sessionRecord = {
      id: generateUniqueId(),
      ...sessionData,
      timestamp: sessionData.timestamp || new Date().toISOString(),
    };

    db.sessions.push(sessionRecord);

    // 古いセッション記録を削除（最新の100件のみ保持）
    if (db.sessions.length > 100) {
      db.sessions = db.sessions.slice(-100);
    }

    await writeJSONSafely(RTMP_SESSIONS_DB_PATH, db);
    console.log('RTMP session recorded:', sessionRecord);

    return sessionRecord;
  } catch (error) {
    console.error(`Error recording RTMP session: ${error.message}`);
    // エラーが発生してもRTMPサーバーの動作を妨げないようにする
    return null;
  }
};

/**
 * RTMPセッション一覧の取得
 * @returns {Promise<Array>} セッション一覧
 */
const getRtmpSessions = async () => {
  try {
    const db = await initializeRtmpSessionDb();
    return db.sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error(`Error getting RTMP sessions: ${error.message}`);
    return [];
  }
};

/**
 * 古いストリームのみを終了する（新しく開始されたストリームを保護）
 * @param {string} streamIdentifier - ストリームキーまたは出力URL
 * @param {number} minAgeMs - 終了対象とする最小経過時間（ミリ秒）
 * @returns {Promise<boolean>} 終了が成功したかどうか
 */
const terminateOldStreams = async (streamIdentifier, minAgeMs = 5000) => {
  try {
    console.log(`Terminating old streams (>${minAgeMs}ms) for identifier: ${streamIdentifier}`);

    // アクティブなストリームの中から該当するものを探して終了
    let terminatedCount = 0;
    const now = Date.now();

    for (const [streamId, streamInfo] of Object.entries(activeStreams)) {
      try {
        const streamRecord = await getStreamInfo(streamId);
        if (
          streamRecord &&
          (streamRecord.streamKey === streamIdentifier ||
            streamRecord.outputUrl === streamIdentifier ||
            streamRecord.outputUrl?.includes(streamIdentifier) ||
            (streamIdentifier.includes('live') && streamRecord.outputUrl?.includes('live')))
        ) {
          // ストリームの開始時間をチェック
          const startTime = new Date(streamRecord.startedAt).getTime();
          const age = now - startTime;

          if (age >= minAgeMs) {
            console.log(
              `Terminating old stream ${streamId} (age: ${age}ms) for identifier ${streamIdentifier}`
            );

            // FFmpegプロセスを強制終了
            if (streamInfo.command) {
              streamInfo.command.kill('SIGKILL');
            }

            // ログストリームを終了
            if (streamInfo.logStream) {
              streamInfo.logStream.end();
            }

            // ストリーム情報を更新（エラーを無視して続行）
            try {
              await saveStreamInfo({
                id: streamId,
                status: 'terminated',
                endedAt: new Date().toISOString(),
                terminationReason: `Terminated old stream (age: ${age}ms) for new stream with identifier: ${streamIdentifier}`,
              });
            } catch (saveError) {
              console.error(`Error saving termination info for ${streamId}:`, saveError.message);
            }

            // アクティブストリームから削除
            delete activeStreams[streamId];
            terminatedCount += 1;
          } else {
            console.log(`Skipping recent stream ${streamId} (age: ${age}ms, min: ${minAgeMs}ms)`);
          }
        }
      } catch (error) {
        console.error(`Error checking stream ${streamId}:`, error);
      }
    }

    console.log(`Terminated ${terminatedCount} old streams for identifier: ${streamIdentifier}`);
    return true;
  } catch (error) {
    console.error(`Error terminating old streams: ${error.message}`);
    return false;
  }
};

module.exports = {
  listActiveStreams,
  getStreamInfo,
  getStreamStatus,
  getRtmpServerInfo,
  startStream,
  stopStream,
  recordRtmpSession,
  getRtmpSessions,
  terminateExistingStreams,
  terminateOldStreams,
};
