const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { generateUniqueId, getCacheDir, fileExists } = require('../utils/fileUtils');

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
      console.warn(`Failed to read persistent-sessions.json, recreating: ${error.message}`);
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
        Object.assign(existingSession, sessionData);
        existingSession.updatedAt = new Date().toISOString();
      } else {
        const sessionId = generateUniqueId();
        const newSession = {
          id: sessionId,
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
      console.error(`Error saving session info: ${error.message}`);
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
      console.error(`Error getting session info: ${error.message}`);
      throw new Error('セッション情報の取得に失敗しました');
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
   * デフォルト静止画の作成
   */
  async createDefaultStandbyImage() {
    const standbyDir = path.join(getCacheDir(), 'standby');
    const defaultPath = path.join(standbyDir, 'default.jpg');

    try {
      await fs.ensureDir(standbyDir);

      // FFmpegを使用して単色の静止画を生成
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input('color=black:size=1920x1080:duration=1')
          .inputOptions(['-f', 'lavfi'])
          .outputOptions(['-vframes', '1', '-y'])
          .output(defaultPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      console.log(`Default standby image created: ${defaultPath}`);
    } catch (error) {
      console.error(`Failed to create default standby image: ${error.message}`);
    }
  }

  /**
   * デュアルRTMP出力用のFFmpegコマンド構築
   */
  buildDualRtmpCommand(input, endpoints, settings) {
    const {
      videoCodec = 'libx264',
      videoBitrate = '2500k',
      videoWidth = 1920,
      videoHeight = 1080,
      fps = 30,
      audioCodec = 'aac',
      audioBitrate = '128k',
      audioSampleRate = 44100,
      audioChannels = 2,
    } = settings;

    let command = ffmpeg(input);

    // 入力オプション
    if (input.includes('.jpg') || input.includes('.png')) {
      // 静止画の場合はループ再生
      command = ffmpeg().input(input).inputOptions(['-loop', '1', '-re']);
    } else {
      command = ffmpeg(input).inputOptions(['-re']);
    }

    // ビデオ設定
    command = command
      .videoCodec(videoCodec)
      .videoBitrate(videoBitrate)
      .fps(fps)
      .size(`${videoWidth}x${videoHeight}`);

    // オーディオ設定
    command = command
      .audioCodec(audioCodec)
      .audioBitrate(audioBitrate)
      .audioFrequency(audioSampleRate)
      .audioChannels(audioChannels);

    // 再接続オプション
    command = command
      .addOption('-reconnect', '1')
      .addOption('-reconnect_streamed', '1')
      .addOption('-reconnect_delay_max', '10')
      .addOption('-rtmp_live', 'live')
      .addOption('-rtmp_buffer', '1000');

    // 有効なエンドポイントのみ出力に追加
    const activeEndpoints = endpoints.filter((ep) => ep.enabled);

    if (activeEndpoints.length === 1) {
      // 単一出力
      const endpoint = activeEndpoints[0];
      const outputUrl = endpoint.streamKey ? `${endpoint.url}/${endpoint.streamKey}` : endpoint.url;
      command = command.format('flv').output(outputUrl);
    } else if (activeEndpoints.length === 2) {
      // デュアル出力
      activeEndpoints.forEach((endpoint) => {
        const outputUrl = endpoint.streamKey
          ? `${endpoint.url}/${endpoint.streamKey}`
          : endpoint.url;
        command = command.format('flv').output(outputUrl);
      });
    }

    return command;
  }

  /**
   * 永続ストリーミングセッションの開始
   */
  async startSession(sessionConfig) {
    try {
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

      // セッションIDの生成
      const sessionId = generateUniqueId();

      // 静止画パスの決定
      const standbyPath = standbyImage || this.getDefaultStandbyImagePath();
      if (!(await fileExists(standbyPath))) {
        throw new Error(`静止画ファイルが見つかりません: ${standbyPath}`);
      }

      // セッション情報を先に保存
      const sessionInfo = await this.saveSessionInfo({
        id: sessionId,
        name: sessionName,
        endpoints: activeEndpoints,
        standbyImage: standbyPath,
        videoSettings,
        audioSettings,
        status: SESSION_STATES.CONNECTING,
        currentInput: standbyPath,
        startedAt: new Date().toISOString(),
      });

      // FFmpegコマンドの構築と実行を非同期で開始
      process.nextTick(async () => {
        try {
          await this.startStreamingProcess(sessionId, standbyPath, activeEndpoints, {
            ...videoSettings,
            ...audioSettings,
          });
        } catch (error) {
          console.error(`Failed to start streaming process for session ${sessionId}:`, error);
          await this.updateSessionStatus(sessionId, SESSION_STATES.ERROR, error.message);
        }
      });

      return sessionInfo;
    } catch (error) {
      console.error(`Error starting persistent session: ${error.message}`);
      throw new Error(`セッションの開始に失敗しました: ${error.message}`);
    }
  }

  /**
   * ストリーミングプロセスの開始
   */
  async startStreamingProcess(sessionId, input, endpoints, settings) {
    try {
      console.log(`Starting streaming process for session: ${sessionId}`);

      const logFile = path.join(getCacheDir('logs'), `session-${sessionId}.log`);
      await fs.ensureDir(path.dirname(logFile));
      const logStream = fs.createWriteStream(logFile);

      // FFmpegコマンドの構築
      const command = this.buildDualRtmpCommand(input, endpoints, settings);

      // イベントハンドラ設定
      command
        .on('start', async (commandLine) => {
          console.log(`Session ${sessionId} started with command: ${commandLine}`);
          logStream.write(`Started: ${new Date().toISOString()}\n`);
          logStream.write(`Command: ${commandLine}\n`);

          await this.updateSessionStatus(sessionId, SESSION_STATES.CONNECTED);
        })
        .on('progress', (progress) => {
          logStream.write(`Progress: ${JSON.stringify(progress)}\n`);
        })
        .on('end', async () => {
          console.log(`Session ${sessionId} ended`);
          logStream.write(`Ended: ${new Date().toISOString()}\n`);
          logStream.end();

          await this.updateSessionStatus(sessionId, SESSION_STATES.DISCONNECTED);
          this.activeSessions.delete(sessionId);
        })
        .on('error', async (err) => {
          console.error(`Session ${sessionId} error:`, err);
          logStream.write(`Error: ${err.message}\n`);
          logStream.end();

          // 再接続を試行
          await this.handleReconnection(sessionId, err);
        });

      // ストリーミング開始
      command.run();

      // アクティブセッションに追加
      this.activeSessions.set(sessionId, {
        command,
        logStream,
        endpoints,
        currentInput: input,
        settings,
        startTime: new Date(),
      });
    } catch (error) {
      console.error(`Error in streaming process for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * セッション状態の更新
   */
  async updateSessionStatus(sessionId, status, errorMessage = null) {
    try {
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (sessionInfo) {
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
      }
    } catch (error) {
      console.error(`Error updating session status: ${error.message}`);
    }
  }

  /**
   * 再接続処理
   */
  async handleReconnection(sessionId, error) {
    try {
      const attempts = this.reconnectAttempts.get(sessionId) || 0;

      if (attempts >= this.maxReconnectAttempts) {
        console.log(`Max reconnection attempts reached for session ${sessionId}`);
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

      console.log(
        `Attempting reconnection ${attempts + 1}/${this.maxReconnectAttempts} for session ${sessionId}`
      );

      // 再接続の遅延
      setTimeout(async () => {
        try {
          const sessionInfo = await this.getSessionInfo(sessionId);
          const activeSession = this.activeSessions.get(sessionId);

          if (sessionInfo && activeSession) {
            await this.startStreamingProcess(
              sessionId,
              activeSession.currentInput,
              activeSession.endpoints,
              activeSession.settings
            );
          }
        } catch (reconnectError) {
          console.error(`Reconnection failed for session ${sessionId}:`, reconnectError);
          await this.handleReconnection(sessionId, reconnectError);
        }
      }, this.reconnectDelay);
    } catch (handlingError) {
      console.error(`Error in reconnection handling: ${handlingError.message}`);
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

      return true;
    } catch (error) {
      console.error(`Error stopping session: ${error.message}`);
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

      return {
        ...sessionInfo,
        isActive: !!activeSession,
        reconnectAttempts: this.reconnectAttempts.get(sessionId) || 0,
        uptime: sessionInfo.startedAt
          ? Math.floor((Date.now() - new Date(sessionInfo.startedAt).getTime()) / 1000)
          : 0,
      };
    } catch (error) {
      console.error(`Error getting session status: ${error.message}`);
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

      console.log(`Switching content for session ${sessionId} to: ${newInput}`);

      // 現在のFFmpegプロセスを停止
      if (activeSession.command) {
        activeSession.command.kill('SIGTERM');
      }

      // セッション状態を更新
      await this.updateSessionStatus(sessionId, SESSION_STATES.CONNECTING);

      // 新しい入力でストリーミングプロセスを再開始
      activeSession.currentInput = newInput;

      // トランジション効果の処理（将来の拡張用）
      if (transition && transition.type === 'fade') {
        console.log(`Applying fade transition: ${transition.duration}s`);
        // 今回はシンプルな切り替えを実装、将来的にフェード効果を追加
      }

      await this.startStreamingProcess(
        sessionId,
        newInput,
        activeSession.endpoints,
        activeSession.settings
      );

      // セッション情報を更新
      const isVideo =
        newInput.includes('.mp4') ||
        newInput.includes('.avi') ||
        newInput.includes('.mov') ||
        newInput.includes('.mkv');
      const newStatus = isVideo ? SESSION_STATES.STREAMING : SESSION_STATES.CONNECTED;

      await this.saveSessionInfo({
        id: sessionId,
        currentInput: newInput,
        status: newStatus,
        lastSwitchAt: new Date().toISOString(),
      });

      return {
        success: true,
        sessionId,
        newInput,
        status: newStatus,
      };
    } catch (error) {
      console.error(`Error switching content for session ${sessionId}:`, error);
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
      console.error(`Error switching to standby for session ${sessionId}:`, error);
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
      console.error(`Error switching to file for session ${sessionId}:`, error);
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
      console.error(`Error uploading standby image for session ${sessionId}:`, error);
      throw new Error(`静止画のアップロードに失敗しました: ${error.message}`);
    }
  }
}

module.exports = {
  PersistentStreamService,
  SESSION_STATES,
};
