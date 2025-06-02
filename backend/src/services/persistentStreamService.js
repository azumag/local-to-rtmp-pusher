const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { generateUniqueId, getCacheDir, fileExists } = require('../utils/fileUtils');
const logger = require('../utils/logger');
const { convertImageToLoopVideo } = require('./imageToVideoConverter');

// セッション状態定義
const SESSION_STATES = {
  DISCONNECTED: 'disconnected', // 未接続
  CONNECTING: 'connecting', // 接続中
  CONNECTED: 'connected', // 接続済み（静止画配信中）
  STREAMING: 'streaming', // ファイル配信中
  RECONNECTING: 'reconnecting', // 再接続中
  ERROR: 'error', // エラー状態
};

// セッション情報の保存先
const SESSIONS_DB_PATH = path.join(getCacheDir(), 'persistent-sessions.json');

// アトミックなJSON書き込み用のユーティリティ
const writeJSONSafely = async (filePath, data) => {
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.writeJSON(tempPath, data);
    await fs.move(tempPath, filePath, { overwrite: true });
  } catch (error) {
    try {
      await fs.remove(tempPath);
    } catch (cleanupError) {
      // クリーンアップエラーは無視
    }
    throw error;
  }
};

class PersistentStreamService {
  constructor() {
    this.activeSessions = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 10000; // 10秒

    // 初回起動時にデフォルト画像を再生成（新しいデザインに更新）
    this.recreateDefaultStandbyImage().catch((err) => {
      logger.warn('Failed to recreate default standby image on startup:', err);
    });
  }

  /**
   * セッションDBの初期化
   */
  async initializeSessionDb() {
    try {
      if (!(await fileExists(SESSIONS_DB_PATH))) {
        await fs.writeJSON(SESSIONS_DB_PATH, { sessions: [] });
      }
      return await fs.readJSON(SESSIONS_DB_PATH);
    } catch (error) {
      logger.warn(`Failed to read persistent-sessions.json, recreating: ${error.message}`);
      const defaultDb = { sessions: [] };
      await writeJSONSafely(SESSIONS_DB_PATH, defaultDb);
      return defaultDb;
    }
  }

  /**
   * セッション情報の保存
   */
  async saveSessionInfo(sessionData) {
    try {
      const db = await this.initializeSessionDb();

      let existingSession = null;
      if (sessionData.id) {
        existingSession = db.sessions.find((s) => s.id === sessionData.id);
      }

      if (existingSession) {
        // 既存のセッションは、statusがDISCONNECTEDの場合のみチェック
        // 他のステータスの場合は更新を許可
        if (
          existingSession.status === SESSION_STATES.DISCONNECTED &&
          sessionData.status !== SESSION_STATES.CONNECTING
        ) {
          throw new Error('終了したセッションは更新できません');
        }
        Object.assign(existingSession, sessionData);
        existingSession.updatedAt = new Date().toISOString();
      } else {
        const newSession = {
          id: sessionData.id || generateUniqueId(),
          ...sessionData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.sessions.push(newSession);
        existingSession = newSession;
      }

      await writeJSONSafely(SESSIONS_DB_PATH, db);
      return existingSession;
    } catch (error) {
      logger.error(`Error saving session info: ${error.message}`);
      throw new Error('セッション情報の保存に失敗しました');
    }
  }

  /**
   * セッション情報の取得
   */
  async getSessionInfo(sessionId) {
    try {
      const db = await this.initializeSessionDb();
      return db.sessions.find((s) => s.id === sessionId) || null;
    } catch (error) {
      logger.error(`Error getting session info: ${error.message}`);
      throw new Error('セッション情報の取得に失敗しました');
    }
  }

  /**
   * セッション情報の削除
   */
  async deleteSessionInfo(sessionId) {
    try {
      const db = await this.initializeSessionDb();
      const index = db.sessions.findIndex((s) => s.id === sessionId);

      if (index !== -1) {
        db.sessions.splice(index, 1);
        await writeJSONSafely(SESSIONS_DB_PATH, db);
      }
    } catch (error) {
      logger.error(`Error deleting session info: ${error.message}`);
    }
  }

  /**
   * デフォルト静止画パスの取得
   */
  getDefaultStandbyImagePath() {
    const defaultPath = path.join(getCacheDir(), 'standby', 'default.jpg');
    if (!fs.existsSync(defaultPath)) {
      // デフォルト静止画が存在しない場合は作成
      this.createDefaultStandbyImage();
    }
    return defaultPath;
  }

  /**
   * デフォルト静止画を強制的に再生成
   */
  async recreateDefaultStandbyImage() {
    const defaultPath = path.join(getCacheDir(), 'standby', 'default.jpg');
    try {
      // 既存のファイルを削除
      if (fs.existsSync(defaultPath)) {
        await fs.unlink(defaultPath);
      }
      // 新しく生成
      await this.createDefaultStandbyImage();
      logger.info('Default standby image recreated successfully');
    } catch (error) {
      logger.error(`Failed to recreate default standby image: ${error.message}`);
    }
  }

  /**
   * デフォルト静止画の作成
   */
  async createDefaultStandbyImage() {
    const standbyDir = path.join(getCacheDir(), 'standby');
    const defaultPath = path.join(standbyDir, 'default.jpg');

    try {
      await fs.ensureDir(standbyDir);

      // FFmpegを使用して優しい色の静止画を生成
      await new Promise((resolve, reject) => {
        // 優しいブルーグレーの背景色 (#7E9DB8)
        const backgroundColor = '7E9DB8';
        const textColor = 'FFFFFF';

        // フィルターコマンドで背景と文字を生成
        const filterComplex = [
          `color=${backgroundColor}:size=1920x1080:duration=1[bg]`,
          // 日本語フォントを指定し、中央に配信準備中のテキストを配置
          `[bg]drawtext=text='配信準備中':fontsize=80:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2-50:font=Hiragino Sans`,
          // 英語テキストも追加
          `drawtext=text='Stream Standby':fontsize=60:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2+50:font=Arial`,
        ].join(',');

        ffmpeg()
          .input('color=white:size=1920x1080:duration=1')
          .inputOptions(['-f', 'lavfi'])
          .complexFilter(filterComplex)
          .outputOptions(['-vframes', '1', '-y'])
          .output(defaultPath)
          .on('end', resolve)
          .on('error', (err) => {
            // フォントエラーの場合は、シンプルな色のみの画像を生成
            logger.warn(
              `Failed to create image with text: ${err.message}. Creating simple colored image.`
            );
            ffmpeg()
              .input(`color=${backgroundColor}:size=1920x1080:duration=1`)
              .inputOptions(['-f', 'lavfi'])
              .outputOptions(['-vframes', '1', '-y'])
              .output(defaultPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          })
          .run();
      });

      logger.info(`Default standby image created: ${defaultPath}`);
    } catch (error) {
      logger.error(`Failed to create default standby image: ${error.message}`);
    }
  }

  /**
   * エンドポイント用の設定をマージ（グローバル設定をデフォルトとして使用）
   */
  mergeEndpointSettings(globalSettings, endpointSettings) {
    const defaults = {
      videoCodec: 'libx264',
      videoBitrate: '2500k',
      videoWidth: 1920,
      videoHeight: 1080,
      fps: 30,
      audioCodec: 'aac',
      audioBitrate: '128k',
      audioSampleRate: 44100,
      audioChannels: 2,
    };

    return {
      videoCodec: endpointSettings?.videoCodec || globalSettings?.videoCodec || defaults.videoCodec,
      videoBitrate:
        endpointSettings?.videoBitrate || globalSettings?.videoBitrate || defaults.videoBitrate,
      videoWidth: endpointSettings?.videoWidth || globalSettings?.videoWidth || defaults.videoWidth,
      videoHeight:
        endpointSettings?.videoHeight || globalSettings?.videoHeight || defaults.videoHeight,
      fps: endpointSettings?.fps || globalSettings?.fps || defaults.fps,
      audioCodec: endpointSettings?.audioCodec || globalSettings?.audioCodec || defaults.audioCodec,
      audioBitrate:
        endpointSettings?.audioBitrate || globalSettings?.audioBitrate || defaults.audioBitrate,
      audioSampleRate:
        endpointSettings?.audioSampleRate ||
        globalSettings?.audioSampleRate ||
        defaults.audioSampleRate,
      audioChannels:
        endpointSettings?.audioChannels || globalSettings?.audioChannels || defaults.audioChannels,
    };
  }

  /**
   * プレイリストベースの複数RTMP出力用のFFmpegコマンド構築
   */
  buildPlaylistRtmpCommand(playlistPath, endpoints, globalSettings) {
    const activeEndpoints = endpoints.filter((ep) => ep.enabled);

    if (activeEndpoints.length === 0) {
      throw new Error('有効なエンドポイントがありません');
    }

    // プレイリストファイルを入力として使用し、concatフォーマットを指定
    const command = ffmpeg().input(playlistPath).inputOptions([
      '-re', // リアルタイム読み込み
      '-f',
      'concat', // concat形式
      '-safe',
      '0', // ファイルパスの安全性チェックを無効化
      // Note: -stream_loop -1 を削除し、代わりにプレイリストに複数のエントリを追加する
    ]);

    // 共通オプション（再接続設定）を追加
    command
      .addOption('-reconnect', '1')
      .addOption('-reconnect_streamed', '1')
      .addOption('-reconnect_delay_max', '10')
      .addOption('-rtmp_live', 'live')
      .addOption('-rtmp_buffer', '1000');

    // 基本的な設定は既存のbuildDualRtmpCommandと同じロジックを流用
    return this.applyEndpointSettings(command, activeEndpoints, globalSettings);
  }

  /**
   * エンドポイント設定をFFmpegコマンドに適用
   */
  applyEndpointSettings(command, activeEndpoints, globalSettings) {
    let ffmpegCommand = command;

    // 単一出力の場合
    if (activeEndpoints.length === 1) {
      const endpoint = activeEndpoints[0];

      // URLとストリームキーの検証
      if (!endpoint.url) {
        throw new Error('RTMPエンドポイントのURLが設定されていません');
      }

      const settings = this.mergeEndpointSettings(globalSettings, {
        ...endpoint.videoSettings,
        ...endpoint.audioSettings,
      });

      ffmpegCommand = ffmpegCommand
        .videoCodec(settings.videoCodec)
        .videoBitrate(settings.videoBitrate)
        .fps(settings.fps)
        .size(`${settings.videoWidth}x${settings.videoHeight}`)
        .audioCodec(settings.audioCodec)
        .audioBitrate(settings.audioBitrate)
        .audioFrequency(settings.audioSampleRate)
        .audioChannels(settings.audioChannels);

      const outputUrl = endpoint.streamKey ? `${endpoint.url}/${endpoint.streamKey}` : endpoint.url;
      ffmpegCommand = ffmpegCommand.format('flv').output(outputUrl);
    } else {
      // 複数出力の場合
      activeEndpoints.forEach((endpoint, index) => {
        if (!endpoint.url) {
          throw new Error(`RTMPエンドポイント${index + 1}のURLが設定されていません`);
        }

        const settings = this.mergeEndpointSettings(globalSettings, {
          ...endpoint.videoSettings,
          ...endpoint.audioSettings,
        });

        const outputUrl = endpoint.streamKey
          ? `${endpoint.url}/${endpoint.streamKey}`
          : endpoint.url;

        ffmpegCommand = ffmpegCommand
          .output(outputUrl)
          .outputOptions([
            '-c:v',
            settings.videoCodec,
            '-b:v',
            settings.videoBitrate,
            '-r',
            settings.fps.toString(),
            '-s',
            `${settings.videoWidth}x${settings.videoHeight}`,
            '-c:a',
            settings.audioCodec,
            '-b:a',
            settings.audioBitrate,
            '-ar',
            settings.audioSampleRate.toString(),
            '-ac',
            settings.audioChannels.toString(),
            '-f',
            'flv',
          ]);
      });
    }

    return ffmpegCommand;
  }

  /**
   * 複数RTMP出力用のFFmpegコマンド構築（エンドポイント毎の設定対応）
   */
  buildDualRtmpCommand(input, endpoints, globalSettings) {
    const activeEndpoints = endpoints.filter((ep) => ep.enabled);

    if (activeEndpoints.length === 0) {
      throw new Error('有効なエンドポイントがありません');
    }

    let command = ffmpeg(input);

    // 入力オプション
    if (input.includes('.jpg') || input.includes('.png')) {
      // 静止画の場合はループ再生
      command = ffmpeg().input(input).inputOptions(['-loop', '1', '-re']);
    } else {
      command = ffmpeg(input).inputOptions(['-re']);
    }

    // 共通オプション
    command = command
      .addOption('-reconnect', '1')
      .addOption('-reconnect_streamed', '1')
      .addOption('-reconnect_delay_max', '10')
      .addOption('-rtmp_live', 'live')
      .addOption('-rtmp_buffer', '1000');

    if (activeEndpoints.length === 1) {
      // 単一出力の場合
      const endpoint = activeEndpoints[0];

      // URLとストリームキーの検証
      if (!endpoint.url) {
        throw new Error('RTMPエンドポイントのURLが設定されていません');
      }

      const settings = this.mergeEndpointSettings(globalSettings, {
        ...endpoint.videoSettings,
        ...endpoint.audioSettings,
      });

      command = command
        .videoCodec(settings.videoCodec)
        .videoBitrate(settings.videoBitrate)
        .fps(settings.fps)
        .size(`${settings.videoWidth}x${settings.videoHeight}`)
        .audioCodec(settings.audioCodec)
        .audioBitrate(settings.audioBitrate)
        .audioFrequency(settings.audioSampleRate)
        .audioChannels(settings.audioChannels);

      const outputUrl = endpoint.streamKey ? `${endpoint.url}/${endpoint.streamKey}` : endpoint.url;
      command = command.format('flv').output(outputUrl);
    } else {
      // 複数出力の場合 - 各エンドポイントに異なる設定を適用
      activeEndpoints.forEach((endpoint, index) => {
        // URLとストリームキーの検証
        if (!endpoint.url) {
          throw new Error(`RTMPエンドポイント${index + 1}のURLが設定されていません`);
        }

        const settings = this.mergeEndpointSettings(globalSettings, {
          ...endpoint.videoSettings,
          ...endpoint.audioSettings,
        });

        const outputUrl = endpoint.streamKey
          ? `${endpoint.url}/${endpoint.streamKey}`
          : endpoint.url;

        // 複数出力の場合、各出力に個別の設定を適用
        // 注意: fluent-ffmpegの制限により、複数出力で異なる設定を使用するには
        // より複雑なFFmpegコマンドが必要な場合があります
        command = command
          .output(outputUrl)
          .outputOptions([
            '-c:v',
            settings.videoCodec,
            '-b:v',
            settings.videoBitrate,
            '-r',
            settings.fps.toString(),
            '-s',
            `${settings.videoWidth}x${settings.videoHeight}`,
            '-c:a',
            settings.audioCodec,
            '-b:a',
            settings.audioBitrate,
            '-ar',
            settings.audioSampleRate.toString(),
            '-ac',
            settings.audioChannels.toString(),
            '-f',
            'flv',
          ]);
      });
    }

    return command;
  }

  /**
   * 永続ストリーミングセッションの開始
   */
  async startSession(sessionConfig) {
    try {
      // Check if FFmpeg is available
      try {
        await new Promise((resolve, reject) => {
          ffmpeg.getAvailableFormats((err, formats) => {
            if (err) {
              reject(
                new Error(
                  'FFmpeg is not installed or not accessible. Please install FFmpeg to use streaming features.'
                )
              );
            } else {
              resolve(formats);
            }
          });
        });
      } catch (ffmpegError) {
        logger.error('FFmpeg check failed:', ffmpegError);
        throw ffmpegError;
      }
      const {
        endpoints,
        standbyImage,
        videoSettings = {},
        audioSettings = {},
        sessionName = 'Default Session',
      } = sessionConfig;

      // 有効なエンドポイントが少なくとも1つ必要
      const activeEndpoints = endpoints.filter((ep) => ep.enabled);
      if (activeEndpoints.length === 0) {
        throw new Error('少なくとも1つのRTMPエンドポイントを有効にしてください');
      }

      // 重複しないセッションIDの生成
      let sessionId;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        sessionId = generateUniqueId();
        const existingSession = await this.getSessionInfo(sessionId);
        if (!existingSession) {
          break;
        }
        attempts += 1;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        throw new Error('セッションIDの生成に失敗しました');
      }

      // 静止画パスの決定
      const standbyPath = standbyImage || this.getDefaultStandbyImagePath();
      if (!(await fileExists(standbyPath))) {
        throw new Error(`静止画ファイルが見つかりません: ${standbyPath}`);
      }

      // セッション情報を先に保存 - 初期状態はCONNECTINGにして、FFmpeg起動後にCONNECTEDに変更
      const sessionInfo = await this.saveSessionInfo({
        id: sessionId,
        name: sessionName,
        endpoints: activeEndpoints,
        standbyImage: standbyPath,
        videoSettings,
        audioSettings,
        status: SESSION_STATES.CONNECTING, // 初期状態はCONNECTING
        currentInput: standbyPath,
        startedAt: new Date().toISOString(),
      });

      logger.info(
        `Session ${sessionId} created with CONNECTING status, waiting for FFmpeg to start`
      );

      // FFmpegプロセスを開始し、成功すればCONNECTED状態に更新
      try {
        await this.startStreamingProcess(sessionId, standbyPath, activeEndpoints, {
          ...videoSettings,
          ...audioSettings,
        });

        // FFmpegプロセス開始成功後、CONNECTED状態に更新
        await this.updateSessionStatus(sessionId, SESSION_STATES.CONNECTED);
        logger.info(`Session ${sessionId} successfully started and set to CONNECTED`);
      } catch (error) {
        logger.error(`Failed to start streaming process for session ${sessionId}:`, error);
        await this.updateSessionStatus(sessionId, SESSION_STATES.ERROR, error.message);
        throw error; // エラーを再スローして呼び出し元にも通知
      }

      return sessionInfo;
    } catch (error) {
      logger.error(`Error starting persistent session: ${error.message}`);
      throw new Error(`セッションの開始に失敗しました: ${error.message}`);
    }
  }

  /**
   * セッション用のプレイリストファイルを作成
   */
  async createPlaylistFile(sessionId, initialInput) {
    const playlistPath = path.join(getCacheDir(), `session-${sessionId}.txt`);

    try {
      let inputPath = initialInput;
      let playlistContent = '';

      // 静止画の場合はループ動画に変換
      if (initialInput.match(/\.(jpg|jpeg|png|gif)$/i)) {
        logger.info(`Converting static image to loop video for session ${sessionId}`);
        inputPath = await convertImageToLoopVideo(initialInput, sessionId);

        // 静止画の場合は、5秒の動画を繰り返し追加（24時間分 = 17280回）
        // ただし、実際には動的に更新するので、最初は10回程度で十分
        for (let i = 0; i < 10; i += 1) {
          playlistContent += `file '${inputPath}'\n`;
        }
      } else {
        // 動画の場合は1回だけ追加
        playlistContent = `file '${inputPath}'\n`;
      }

      await fs.writeFile(playlistPath, playlistContent, 'utf8');

      logger.info(`Created playlist file for session ${sessionId}: ${playlistPath}`);
      return playlistPath;
    } catch (error) {
      logger.error(`Error creating playlist file for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * プレイリストファイルを更新
   */
  async updatePlaylistFile(sessionId, newInput) {
    const playlistPath = path.join(getCacheDir(), `session-${sessionId}.txt`);

    try {
      let inputPath = newInput;
      let playlistContent = '';

      // 静止画の場合はループ動画に変換
      if (newInput.match(/\.(jpg|jpeg|png|gif)$/i)) {
        logger.info(
          `Converting static image to loop video for playlist update in session ${sessionId}`
        );
        inputPath = await convertImageToLoopVideo(newInput, sessionId);

        // 静止画の場合は複数回繰り返し
        for (let i = 0; i < 10; i += 1) {
          playlistContent += `file '${inputPath}'\n`;
        }
      } else {
        // 動画の場合は1回だけ追加し、その後静止画に戻る
        const sessionInfo = await this.getSessionInfo(sessionId);
        const standbyPath = sessionInfo?.standbyImage || this.getDefaultStandbyImagePath();

        // 静止画をループ動画に変換
        let standbyLoopPath = standbyPath;
        if (standbyPath.match(/\.(jpg|jpeg|png|gif)$/i)) {
          standbyLoopPath = await convertImageToLoopVideo(standbyPath, `${sessionId}-standby`);
        }

        // 動画ファイルを1回再生し、その後静止画をループ
        playlistContent = `file '${inputPath}'\n`;
        // 静止画を複数回追加
        for (let i = 0; i < 10; i += 1) {
          playlistContent += `file '${standbyLoopPath}'\n`;
        }
      }

      await fs.writeFile(playlistPath, playlistContent, 'utf8');

      logger.info(`Updated playlist file for session ${sessionId} with: ${inputPath}`);
      return playlistPath;
    } catch (error) {
      logger.error(`Error updating playlist file for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * プレイリストベースのストリーミングプロセスの開始
   */
  async startStreamingProcess(sessionId, input, endpoints, settings) {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          logger.info(`Starting playlist-based streaming process for session: ${sessionId}`);

          const logFile = path.join(getCacheDir('logs'), `session-${sessionId}.log`);
          fs.ensureDirSync(path.dirname(logFile));
          const logStream = fs.createWriteStream(logFile);

          // プレイリストファイルを作成
          const playlistPath = await this.createPlaylistFile(sessionId, input);

          // プレイリストベースのFFmpegコマンドの構築
          const command = this.buildPlaylistRtmpCommand(playlistPath, endpoints, settings);

          let processStarted = false;

          // タイムアウト設定（3秒でFFmpeg起動失敗とみなす）
          const startTimeout = setTimeout(() => {
            if (!processStarted) {
              logStream.end();
              reject(new Error('FFmpeg起動がタイムアウトしました（3秒）'));
            }
          }, 3000);

          // イベントハンドラ設定
          command
            .on('start', (commandLine) => {
              processStarted = true;
              clearTimeout(startTimeout);

              logger.info(`Session ${sessionId} FFmpeg started with command: ${commandLine}`);
              logStream.write(`Started: ${new Date().toISOString()}\n`);
              logStream.write(`Command: ${commandLine}\n`);

              // アクティブセッションに追加
              this.activeSessions.set(sessionId, {
                command,
                logStream,
                endpoints,
                currentInput: input,
                settings,
                startTime: new Date(),
              });

              // FFmpeg開始成功を通知
              resolve();
            })
            .on('progress', async (progress) => {
              logStream.write(`Progress: ${JSON.stringify(progress)}\n`);

              // プレイリストの動的更新をチェック
              await this.checkAndUpdatePlaylist(sessionId, progress);
            })
            .on('end', async () => {
              logger.info(`Session ${sessionId} ended`);
              logStream.write(`Ended: ${new Date().toISOString()}\n`);
              logStream.end();

              // セッションを切断する代わりに、自動的に静止画配信に戻す
              await this.handleFileStreamEnd(sessionId);
            })
            .on('error', async (err) => {
              logger.error(`Session ${sessionId} error:`, err);
              logStream.write(`Error: ${err.message}\n`);
              logStream.end();

              // 開始前のエラーの場合は起動失敗として扱う
              if (!processStarted) {
                clearTimeout(startTimeout);
                reject(err);
                return;
              }

              // セッションが既に削除されている場合は再接続しない
              const sessionInfo = await this.getSessionInfo(sessionId);
              if (!sessionInfo) {
                logger.info(`Session ${sessionId} has been deleted, skipping reconnection`);
                this.activeSessions.delete(sessionId);
                return;
              }

              // ファイル配信中のエラーの場合、静止画に戻すことを試行
              if (
                sessionInfo.currentInput &&
                !sessionInfo.currentInput.includes('standby') &&
                !sessionInfo.currentInput.includes('default.jpg')
              ) {
                logger.info(
                  `File streaming error for session ${sessionId}, attempting to switch back to standby`
                );
                await this.handleFileStreamEnd(sessionId);
              } else {
                // 静止画配信中のエラーの場合は従来通り再接続を試行
                await this.updateSessionStatus(sessionId, SESSION_STATES.ERROR, err.message);
                await this.handleReconnection(sessionId, err);
              }
            });

          // ストリーミング開始
          command.run();
          logger.info(`FFmpeg process starting for session ${sessionId}...`);
        } catch (error) {
          logger.error(`Error in streaming process for session ${sessionId}:`, error);
          reject(error);
        }
      })();
    });
  }

  /**
   * セッション状態の更新
   */
  async updateSessionStatus(sessionId, status, errorMessage = null) {
    try {
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (sessionInfo) {
        logger.info(`Updating session ${sessionId} status from ${sessionInfo.status} to ${status}`);

        const updateData = {
          id: sessionId,
          status,
          updatedAt: new Date().toISOString(),
        };

        if (errorMessage) {
          updateData.errorMessage = errorMessage;
        }

        if (status === SESSION_STATES.DISCONNECTED) {
          updateData.endedAt = new Date().toISOString();
        }

        await this.saveSessionInfo(updateData);
        logger.info(`Session ${sessionId} status successfully updated to ${status}`);
      } else {
        logger.warn(`Session ${sessionId} not found for status update`);
      }
    } catch (error) {
      logger.error(`Error updating session status: ${error.message}`);
    }
  }

  /**
   * 再接続処理
   */
  async handleReconnection(sessionId, error) {
    try {
      const attempts = this.reconnectAttempts.get(sessionId) || 0;

      if (attempts >= this.maxReconnectAttempts) {
        logger.info(`Max reconnection attempts reached for session ${sessionId}`);
        await this.updateSessionStatus(
          sessionId,
          SESSION_STATES.ERROR,
          `最大再接続試行回数に達しました: ${error.message}`
        );
        this.reconnectAttempts.delete(sessionId);
        return;
      }

      this.reconnectAttempts.set(sessionId, attempts + 1);
      await this.updateSessionStatus(sessionId, SESSION_STATES.RECONNECTING);

      logger.info(
        `Attempting reconnection ${attempts + 1}/${this.maxReconnectAttempts} for session ${sessionId}`
      );

      // 再接続の遅延
      setTimeout(async () => {
        try {
          const sessionInfo = await this.getSessionInfo(sessionId);
          const activeSession = this.activeSessions.get(sessionId);

          // セッションが削除されている場合は再接続しない
          if (!sessionInfo) {
            logger.info(`Session ${sessionId} has been deleted, stopping reconnection attempts`);
            this.reconnectAttempts.delete(sessionId);
            this.activeSessions.delete(sessionId);
            return;
          }

          if (sessionInfo && activeSession) {
            await this.startStreamingProcess(
              sessionId,
              activeSession.currentInput,
              activeSession.endpoints,
              activeSession.settings
            );
            // 再接続成功時はカウンターをリセット
            this.reconnectAttempts.delete(sessionId);
          }
        } catch (reconnectError) {
          logger.error(`Reconnection failed for session ${sessionId}:`, reconnectError);
          await this.handleReconnection(sessionId, reconnectError);
        }
      }, this.reconnectDelay);
    } catch (handlingError) {
      logger.error(`Error in reconnection handling: ${handlingError.message}`);
    }
  }

  /**
   * セッションの停止
   */
  async stopSession(sessionId) {
    try {
      const activeSession = this.activeSessions.get(sessionId);

      if (activeSession) {
        // FFmpegプロセスの停止
        if (activeSession.command) {
          activeSession.command.kill('SIGTERM');
        }

        // ログストリームの終了
        if (activeSession.logStream) {
          activeSession.logStream.end();
        }

        this.activeSessions.delete(sessionId);
      }

      // セッション情報の更新
      await this.updateSessionStatus(sessionId, SESSION_STATES.DISCONNECTED);
      this.reconnectAttempts.delete(sessionId);

      // セッション情報をデータベースから削除
      await this.deleteSessionInfo(sessionId);

      return true;
    } catch (error) {
      logger.error(`Error stopping session: ${error.message}`);
      throw new Error('セッションの停止に失敗しました');
    }
  }

  /**
   * アクティブセッション一覧の取得
   */
  getActiveSessions() {
    const sessions = [];
    for (const [sessionId, sessionData] of this.activeSessions) {
      sessions.push({
        id: sessionId,
        startTime: sessionData.startTime,
        currentInput: sessionData.currentInput,
        endpoints: sessionData.endpoints,
      });
    }
    return sessions;
  }

  /**
   * セッション状態の取得
   */
  async getSessionStatus(sessionId) {
    try {
      const sessionInfo = await this.getSessionInfo(sessionId);
      const activeSession = this.activeSessions.get(sessionId);

      if (!sessionInfo) {
        return null;
      }

      // 現在の入力が静止画かどうかを判定
      const currentInput = sessionInfo.currentInput || '';
      const isStandbyImage =
        currentInput.includes('.jpg') ||
        currentInput.includes('.png') ||
        currentInput.includes('.gif') ||
        currentInput.includes('standby');

      // 静止画のファイル名を取得
      const standbyImageName = isStandbyImage ? path.basename(currentInput) : null;

      return {
        ...sessionInfo,
        isActive: !!activeSession,
        reconnectAttempts: this.reconnectAttempts.get(sessionId) || 0,
        uptime: sessionInfo.startedAt
          ? Math.floor((Date.now() - new Date(sessionInfo.startedAt).getTime()) / 1000)
          : 0,
        isStandbyImage,
        standbyImageName,
        currentInputType: isStandbyImage ? 'standby' : 'file',
      };
    } catch (error) {
      logger.error(`Error getting session status: ${error.message}`);
      throw new Error('セッション状態の取得に失敗しました');
    }
  }

  /**
   * コンテンツの切り替え（ファイルまたは静止画）
   */
  async switchContent(sessionId, newInput, transition = null) {
    try {
      const activeSession = this.activeSessions.get(sessionId);
      if (!activeSession) {
        throw new Error('指定されたセッションがアクティブではありません');
      }

      // 新しい入力ファイルの存在確認
      if (!(await fileExists(newInput))) {
        throw new Error(`入力ファイルが見つかりません: ${newInput}`);
      }

      logger.info(`Switching content for session ${sessionId} to: ${newInput}`);

      // プレイリストファイルを更新（FFmpegプロセスは停止せずに継続）
      await this.updatePlaylistFile(sessionId, newInput);

      // セッション状態を即座にSTREAMINGに更新（プロセス停止なしなので高速）
      const newStatus =
        newInput.includes('standby') || newInput.includes('default.jpg')
          ? SESSION_STATES.CONNECTED
          : SESSION_STATES.STREAMING;

      await this.updateSessionStatus(sessionId, newStatus);

      // アクティブセッションの現在入力を更新
      activeSession.currentInput = newInput;

      // トランジション効果の処理（将来の拡張用）
      if (transition && transition.type === 'fade') {
        logger.info(`Applying fade transition: ${transition.duration}s`);
        // プレイリストベースでのフェード効果は将来実装
      }

      // セッション情報を更新
      await this.saveSessionInfo({
        id: sessionId,
        currentInput: newInput,
        status: newStatus,
        lastSwitchAt: new Date().toISOString(),
      });

      logger.info(`Content switched successfully for session ${sessionId} to ${newStatus} state`);

      // returnの際に現在の状態を確認
      const currentStatus = await this.getSessionStatus(sessionId);
      return {
        success: true,
        sessionId,
        newInput,
        status: currentStatus?.status || SESSION_STATES.CONNECTED,
      };
    } catch (error) {
      logger.error(`Error switching content for session ${sessionId}:`, error);
      await this.updateSessionStatus(sessionId, SESSION_STATES.ERROR, error.message);
      throw new Error(`コンテンツの切り替えに失敗しました: ${error.message}`);
    }
  }

  /**
   * 静止画に戻る
   */
  async switchToStandby(sessionId) {
    try {
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (!sessionInfo) {
        throw new Error('指定されたセッションが見つかりません');
      }

      const standbyPath = sessionInfo.standbyImage || this.getDefaultStandbyImagePath();
      return await this.switchContent(sessionId, standbyPath);
    } catch (error) {
      logger.error(`Error switching to standby for session ${sessionId}:`, error);
      throw new Error(`静止画への切り替えに失敗しました: ${error.message}`);
    }
  }

  /**
   * ファイルによるコンテンツ切り替え
   */
  async switchToFile(sessionId, fileId, isGoogleDriveFile = false) {
    try {
      let filePath;

      if (isGoogleDriveFile) {
        // Google Driveファイルの場合
        const googleDriveService = require('./googleDriveService');
        const downloadInfo = await googleDriveService.downloadFile(fileId);
        filePath = downloadInfo.localPath;
      } else {
        // ローカルファイルの場合
        const fileService = require('./fileService');
        const fileInfo = await fileService.getFileById(fileId);
        if (!fileInfo) {
          throw new Error('指定されたファイルが見つかりません');
        }
        filePath = fileInfo.path;
      }

      return await this.switchContent(sessionId, filePath);
    } catch (error) {
      logger.error(`Error switching to file for session ${sessionId}:`, error);
      throw new Error(`ファイルへの切り替えに失敗しました: ${error.message}`);
    }
  }

  /**
   * 静止画のアップロード
   */
  async uploadStandbyImage(sessionId, imageBuffer, filename) {
    try {
      const standbyDir = path.join(getCacheDir(), 'standby');
      await fs.ensureDir(standbyDir);

      const imagePath = path.join(standbyDir, `${sessionId}-${filename}`);
      await fs.writeFile(imagePath, imageBuffer);

      // セッション情報を更新
      await this.saveSessionInfo({
        id: sessionId,
        standbyImage: imagePath,
      });

      return {
        success: true,
        imagePath,
        filename,
      };
    } catch (error) {
      logger.error(`Error uploading standby image for session ${sessionId}:`, error);
      throw new Error(`静止画のアップロードに失敗しました: ${error.message}`);
    }
  }

  /**
   * プレイリストの動的更新をチェック
   */
  async checkAndUpdatePlaylist(sessionId, progress) {
    try {
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (!sessionInfo) return;

      // 現在のプレイリストファイルを読み込む
      const playlistPath = path.join(getCacheDir(), `session-${sessionId}.txt`);
      const playlistContent = await fs.readFile(playlistPath, 'utf8');
      const lines = playlistContent
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      // 残りのエントリが5個以下になったら、静止画のエントリを追加
      if (lines.length <= 5 && sessionInfo.currentInput?.match(/\.(jpg|jpeg|png|gif|mp4)$/i)) {
        const standbyPath = sessionInfo.standbyImage || this.getDefaultStandbyImagePath();
        let standbyLoopPath = standbyPath;

        if (standbyPath.match(/\.(jpg|jpeg|png|gif)$/i)) {
          standbyLoopPath = await convertImageToLoopVideo(standbyPath, `${sessionId}-standby`);
        }

        // 静止画のエントリを追加
        let newContent = playlistContent;
        for (let i = 0; i < 10; i += 1) {
          newContent += `file '${standbyLoopPath}'\n`;
        }

        await fs.writeFile(playlistPath, newContent, 'utf8');
        logger.info(`Added more standby entries to playlist for session ${sessionId}`);
      }
    } catch (error) {
      // エラーがあってもストリーミングを継続
      logger.warn(`Error checking playlist update for session ${sessionId}:`, error);
    }
  }

  /**
   * ファイル配信終了時の処理 - 自動的に静止画配信に戻す
   */
  async handleFileStreamEnd(sessionId) {
    try {
      logger.info(
        `Handling file stream end for session ${sessionId}, switching to standby (playlist-based)`
      );

      // セッション情報を取得
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (!sessionInfo) {
        logger.warn(`Session ${sessionId} not found, cannot switch to standby`);
        return;
      }

      // アクティブセッションを確認
      const activeSession = this.activeSessions.get(sessionId);
      if (!activeSession) {
        logger.warn(`Active session ${sessionId} not found, cannot switch to standby`);
        return;
      }

      // デフォルト静止画パスを取得
      const standbyPath = sessionInfo.standbyImage || this.getDefaultStandbyImagePath();

      logger.info(`Switching session ${sessionId} back to standby image: ${standbyPath}`);

      // プレイリストファイルを更新してスタンバイ画像に切り替え（FFmpegプロセスは継続）
      await this.updatePlaylistFile(sessionId, standbyPath);

      // アクティブセッションの現在入力を更新
      activeSession.currentInput = standbyPath;

      // セッション情報とステータスを更新（CONNECTED状態に戻す）
      await this.saveSessionInfo({
        id: sessionId,
        currentInput: standbyPath,
        status: SESSION_STATES.CONNECTED,
        lastSwitchAt: new Date().toISOString(),
      });

      logger.info(
        `Session ${sessionId} successfully switched back to standby after file stream end (playlist-based)`
      );
    } catch (error) {
      logger.error(`Error handling file stream end for session ${sessionId}:`, error);

      // エラーが発生した場合は、セッションをエラー状態に設定し、再接続を試行
      await this.updateSessionStatus(sessionId, SESSION_STATES.ERROR, error.message);
      await this.handleReconnection(sessionId, error);
    }
  }
}

module.exports = {
  PersistentStreamService,
  SESSION_STATES,
};
