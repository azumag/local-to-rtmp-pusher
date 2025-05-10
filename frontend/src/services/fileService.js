import apiClient from './apiClient';

/**
 * ファイル一覧を取得
 * @returns {Promise} APIレスポンス
 */
export const listFiles = () => {
  return apiClient.get('/files');
};

/**
 * ファイルをアップロード
 * @param {FormData} formData - アップロードするファイルデータ
 * @param {Function} onProgress - 進捗コールバック関数
 * @returns {Promise} APIレスポンス
 */
export const uploadFile = (formData, onProgress) => {
  return apiClient.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: onProgress
      ? (progressEvent) => onProgress(progressEvent)
      : undefined,
  });
};

/**
 * ファイル情報を取得
 * @param {string} fileId - ファイルID
 * @returns {Promise} APIレスポンス
 */
export const getFileInfo = (fileId) => {
  return apiClient.get(`/files/${fileId}`);
};

/**
 * ファイルを削除
 * @param {string} fileId - ファイルID
 * @returns {Promise} APIレスポンス
 */
export const deleteFile = (fileId) => {
  return apiClient.delete(`/files/${fileId}`);
};