import { useState, useEffect, useCallback, useRef } from 'react';
import persistentStreamService, {
  SESSION_STATES,
  SESSION_STATE_LABELS,
} from '../services/persistentStreamService';

/**
 * 永続ストリーミングセッション管理フック
 */
export const usePersistentStreaming = () => {
  const [activeSessions, setActiveSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rtmpConfig, setRtmpConfig] = useState(null);

  // ステータス監視用のインターバル
  const statusIntervalRef = useRef(null);

  /**
   * エラー状態をクリア
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * アクティブセッション一覧を取得
   */
  const fetchActiveSessions = useCallback(async () => {
    try {
      const sessions = await persistentStreamService.getActiveSessions();
      setActiveSessions(sessions);

      // 現在のセッションが存在するかチェック
      if (currentSession && !sessions.find((s) => s.id === currentSession.id)) {
        setCurrentSession(null);
        setSessionStatus(null);
      }
    } catch (err) {
      console.error('Failed to fetch active sessions:', err);
    }
  }, [currentSession]);

  /**
   * セッション状態を取得
   */
  const fetchSessionStatus = useCallback(async (sessionId) => {
    if (!sessionId) return;

    try {
      const status = await persistentStreamService.getSessionStatus(sessionId);
      setSessionStatus(status);

      // セッションが見つからない場合は現在のセッションをクリア
      if (!status) {
        setCurrentSession(null);
        setSessionStatus(null);
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err);
      // 404エラーの場合はセッションが存在しないとみなす
      if (err.message.includes('見つかりません')) {
        setCurrentSession(null);
        setSessionStatus(null);
      }
    }
  }, []);

  /**
   * RTMP設定を取得
   */
  const fetchRtmpConfig = useCallback(async () => {
    try {
      const config = await persistentStreamService.getRtmpConfig();
      setRtmpConfig(config);
    } catch (err) {
      console.error('Failed to fetch RTMP config:', err);
    }
  }, []);

  /**
   * 配信セッションを開始
   */
  const startSession = useCallback(
    async (sessionConfig) => {
      setIsLoading(true);
      setError(null);

      try {
        const session = await persistentStreamService.startSession(sessionConfig);
        setCurrentSession(session);
        
        // セッション開始直後に状態を即座に取得
        await fetchSessionStatus(session.id);
        await fetchActiveSessions();
        
        return session;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchActiveSessions, fetchSessionStatus]
  );

  /**
   * 配信セッションを停止
   */
  const stopSession = useCallback(
    async (sessionId) => {
      setIsLoading(true);
      setError(null);

      try {
        await persistentStreamService.stopSession(sessionId);

        // 現在のセッションが停止された場合はクリア
        if (currentSession && currentSession.id === sessionId) {
          setCurrentSession(null);
          setSessionStatus(null);
        }

        await fetchActiveSessions();
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, fetchActiveSessions]
  );

  /**
   * ファイルに切り替え
   */
  const switchToFile = useCallback(
    async (sessionId, fileId, isGoogleDriveFile = false, transition = null) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await persistentStreamService.switchToFile(
          sessionId,
          fileId,
          isGoogleDriveFile,
          transition
        );

        // セッション状態を即座に更新
        await fetchSessionStatus(sessionId);
        return result;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchSessionStatus]
  );

  /**
   * 静止画に切り替え
   */
  const switchToStandby = useCallback(
    async (sessionId) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await persistentStreamService.switchToStandby(sessionId);

        // セッション状態を即座に更新
        await fetchSessionStatus(sessionId);
        return result;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchSessionStatus]
  );

  /**
   * 静止画をアップロード
   */
  const uploadStandbyImage = useCallback(async (sessionId, imageFile) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await persistentStreamService.uploadStandbyImage(sessionId, imageFile);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * RTMP設定を保存
   */
  const saveRtmpConfig = useCallback(async (config) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await persistentStreamService.saveRtmpConfig(config);
      setRtmpConfig(config);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * セッションを選択
   */
  const selectSession = useCallback((session) => {
    setCurrentSession(session);
  }, []);

  /**
   * 定期的なステータス監視を開始
   */
  const startStatusMonitoring = useCallback(
    (sessionId, interval = 3000) => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }

      statusIntervalRef.current = setInterval(() => {
        fetchSessionStatus(sessionId);
      }, interval);
    },
    [fetchSessionStatus]
  );

  /**
   * ステータス監視を停止
   */
  const stopStatusMonitoring = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  }, []);

  // 初期データの取得
  useEffect(() => {
    fetchActiveSessions();
    fetchRtmpConfig();
  }, [fetchActiveSessions, fetchRtmpConfig]);

  // アクティブセッションがあるのに現在のセッションが選択されていない場合、自動的に選択
  useEffect(() => {
    if (!currentSession && activeSessions.length > 0) {
      setCurrentSession(activeSessions[0]);
    }
  }, [currentSession, activeSessions]);

  // 現在のセッションの状態監視
  useEffect(() => {
    if (currentSession) {
      fetchSessionStatus(currentSession.id);
      startStatusMonitoring(currentSession.id, 2000); // 2秒ごとに状態を確認
    } else {
      stopStatusMonitoring();
    }

    return () => {
      stopStatusMonitoring();
    };
  }, [currentSession, fetchSessionStatus, startStatusMonitoring, stopStatusMonitoring]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopStatusMonitoring();
    };
  }, [stopStatusMonitoring]);

  return {
    // 状態
    activeSessions,
    currentSession,
    sessionStatus,
    isLoading,
    error,
    rtmpConfig,

    // アクション
    startSession,
    stopSession,
    switchToFile,
    switchToStandby,
    uploadStandbyImage,
    saveRtmpConfig,
    selectSession,
    fetchActiveSessions,
    fetchSessionStatus,
    clearError,
    startStatusMonitoring,
    stopStatusMonitoring,

    // ユーティリティ
    SESSION_STATES,
    SESSION_STATE_LABELS,

    // ヘルパー関数
    isSessionActive: currentSession && sessionStatus?.isActive,
    canSwitchContent:
      sessionStatus?.status === SESSION_STATES.CONNECTED ||
      sessionStatus?.status === SESSION_STATES.STREAMING,
    isConnecting:
      sessionStatus?.status === SESSION_STATES.CONNECTING ||
      sessionStatus?.status === SESSION_STATES.RECONNECTING,
  };
};
