import apiClient from './apiClient';

// セッション状態定数
export const SESSION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  STREAMING: 'streaming',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};

// セッション状態の日本語表示
export const SESSION_STATE_LABELS = {
  [SESSION_STATES.DISCONNECTED]: '未接続',
  [SESSION_STATES.CONNECTING]: '接続中',
  [SESSION_STATES.CONNECTED]: '配信中（静止画）',
  [SESSION_STATES.STREAMING]: '配信中（ファイル）',
  [SESSION_STATES.RECONNECTING]: '再接続中',
  [SESSION_STATES.ERROR]: 'エラー',
};

/**
 * 永続ストリーミングセッション管理サービス
 */
class PersistentStreamService {
  /**
   * 配信セッションを開始
   * @param {Object} sessionConfig - セッション設定
   * @returns {Promise<Object>} セッション情報
   */
  async startSession(sessionConfig) {
    try {
      const response = await apiClient.post('/stream/session/start', sessionConfig);
      return response.data;
    } catch (error) {
      console.error('Failed to start session:', error);
      throw new Error(error.response?.data?.error || 'セッションの開始に失敗しました');
    }
  }

  /**
   * 配信セッションを停止
   * @param {string} sessionId - セッションID
   * @returns {Promise<Object>} 停止結果
   */
  async stopSession(sessionId) {
    try {
      const response = await apiClient.post(`/stream/session/stop/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to stop session:', error);
      throw new Error(error.response?.data?.error || 'セッションの停止に失敗しました');
    }
  }

  /**
   * セッション状態を取得
   * @param {string} sessionId - セッションID
   * @returns {Promise<Object>} セッション状態
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await apiClient.get(`/stream/session/status/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get session status:', error);
      throw new Error(error.response?.data?.error || 'セッション状態の取得に失敗しました');
    }
  }

  /**
   * アクティブセッション一覧を取得
   * @returns {Promise<Array>} アクティブセッション一覧
   */
  async getActiveSessions() {
    try {
      const response = await apiClient.get('/stream/session/active');
      return response.data;
    } catch (error) {
      console.error('Failed to get active sessions:', error);
      throw new Error(
        error.response?.data?.error || 'アクティブセッション一覧の取得に失敗しました'
      );
    }
  }

  /**
   * ファイルに切り替え
   * @param {string} sessionId - セッションID
   * @param {string} fileId - ファイルID
   * @param {boolean} isGoogleDriveFile - Google Driveファイルかどうか
   * @param {Object} transition - トランジション設定
   * @returns {Promise<Object>} 切り替え結果
   */
  async switchToFile(sessionId, fileId, isGoogleDriveFile = false, transition = null) {
    try {
      const response = await apiClient.post('/stream/content/switch', {
        sessionId,
        fileId,
        isGoogleDriveFile,
        transition,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to switch to file:', error);
      throw new Error(error.response?.data?.error || 'ファイルへの切り替えに失敗しました');
    }
  }

  /**
   * 静止画に切り替え
   * @param {string} sessionId - セッションID
   * @returns {Promise<Object>} 切り替え結果
   */
  async switchToStandby(sessionId) {
    try {
      const response = await apiClient.post('/stream/content/idle', {
        sessionId,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to switch to standby:', error);
      throw new Error(error.response?.data?.error || '静止画への切り替えに失敗しました');
    }
  }

  /**
   * 静止画をアップロード
   * @param {string} sessionId - セッションID
   * @param {File} imageFile - 画像ファイル
   * @returns {Promise<Object>} アップロード結果
   */
  async uploadStandbyImage(sessionId, imageFile) {
    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('image', imageFile);

      const response = await apiClient.post('/stream/content/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to upload standby image:', error);
      throw new Error(error.response?.data?.error || '静止画のアップロードに失敗しました');
    }
  }

  /**
   * RTMP設定を保存
   * @param {Object} config - RTMP設定
   * @returns {Promise<Object>} 保存結果
   */
  async saveRtmpConfig(config) {
    try {
      const response = await apiClient.post('/stream/config/rtmp', config);
      return response.data;
    } catch (error) {
      console.error('Failed to save RTMP config:', error);
      throw new Error(error.response?.data?.error || 'RTMP設定の保存に失敗しました');
    }
  }

  /**
   * RTMP設定を取得
   * @returns {Promise<Object>} RTMP設定
   */
  async getRtmpConfig() {
    try {
      const response = await apiClient.get('/stream/config/rtmp');
      return response.data;
    } catch (error) {
      console.error('Failed to get RTMP config:', error);
      throw new Error(error.response?.data?.error || 'RTMP設定の取得に失敗しました');
    }
  }

  /**
   * セッション状態定数を取得
   * @returns {Promise<Object>} セッション状態定数
   */
  async getSessionStates() {
    try {
      const response = await apiClient.get('/stream/session/states');
      return response.data;
    } catch (error) {
      console.error('Failed to get session states:', error);
      throw new Error(error.response?.data?.error || 'セッション状態定数の取得に失敗しました');
    }
  }
}

// シングルトンインスタンスをエクスポート
const persistentStreamService = new PersistentStreamService();
export default persistentStreamService;
