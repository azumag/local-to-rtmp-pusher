import apiClient, { createGoogleDriveRequest } from './apiClient';

/**
 * Google Drive共有URLからファイル一覧を取得
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {Promise} APIレスポンス
 */
export const listFilesFromShareUrl = (shareUrl) => {
  return apiClient.post('/google-drive/list', { shareUrl });
};

/**
 * Google DriveファイルIDからファイル情報を取得
 * @param {string} fileId - Google DriveファイルID
 * @returns {Promise} APIレスポンス
 */
export const getFileInfo = (fileId) => {
  return apiClient.get(`/google-drive/file/${fileId}`);
};

/**
 * Google Driveファイルをダウンロード
 * @param {string} fileId - Google DriveファイルID
 * @returns {Promise} APIレスポンス
 */
export const downloadFile = (fileId) => {
  return apiClient.post('/google-drive/download', { fileId });
};

/**
 * Google Driveファイルのダウンロードステータスを取得
 * @param {string} fileId - Google DriveファイルID
 * @returns {Promise} APIレスポンス
 */
export const getDownloadStatus = (fileId) => {
  return apiClient.get(`/google-drive/download/${fileId}/status`);
};

/**
 * Google Driveファイルを直接ストリーミング
 * @param {Object} streamData - ストリーム設定データ
 * @returns {Promise} APIレスポンス
 */
export const streamFile = (streamData) => {
  return createGoogleDriveRequest({
    method: 'post',
    url: '/google-drive/stream',
    data: streamData,
  });
};

/**
 * Google Drive共有URLからフォルダIDを抽出
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {Promise} APIレスポンス
 */
export const extractFolderId = (shareUrl) => {
  return apiClient.post('/google-drive/extract-folder-id', { shareUrl });
};
