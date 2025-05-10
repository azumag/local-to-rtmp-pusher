import apiClient from './apiClient';

/**
 * アクティブなストリーム一覧を取得
 * @returns {Promise} APIレスポンス
 */
export const listActiveStreams = () => {
  return apiClient.get('/stream');
};

/**
 * ストリームを開始
 * @param {Object} streamData - ストリーム設定データ
 * @returns {Promise} APIレスポンス
 */
export const startStream = (streamData) => {
  return apiClient.post('/stream/start', streamData);
};

/**
 * ストリームを停止
 * @param {string} streamId - ストリームID
 * @returns {Promise} APIレスポンス
 */
export const stopStream = (streamId) => {
  return apiClient.post(`/stream/stop/${streamId}`);
};

/**
 * ストリーム情報を取得
 * @param {string} streamId - ストリームID
 * @returns {Promise} APIレスポンス
 */
export const getStreamInfo = (streamId) => {
  return apiClient.get(`/stream/${streamId}`);
};

/**
 * ストリームステータスを取得
 * @param {string} streamId - ストリームID
 * @returns {Promise} APIレスポンス
 */
export const getStreamStatus = (streamId) => {
  return apiClient.get(`/stream/${streamId}/status`);
};

/**
 * RTMPサーバー情報を取得
 * @returns {Promise} APIレスポンス
 */
export const getRtmpServerInfo = () => {
  return apiClient.get('/stream/server/info');
};