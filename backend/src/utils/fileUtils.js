const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// デフォルトのキャッシュディレクトリ
const DEFAULT_CACHE_DIR = path.join(__dirname, '../../cache');

/**
 * 一意のIDを生成
 * @returns {string} ユニークID
 */
const generateUniqueId = () => crypto.randomBytes(16).toString('hex');

/**
 * ファイルの存在確認
 * @param {string} filePath - ファイルパス
 * @returns {boolean} ファイルが存在する場合はtrue
 */
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * ファイルタイプを確認
 * @param {string} filePath - ファイルパス
 * @returns {string} ファイルタイプ
 */
const getFileType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.mpg', '.mpeg'];
  const audioExts = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a'];

  if (videoExts.includes(ext)) {
    return 'video';
  }
  if (audioExts.includes(ext)) {
    return 'audio';
  }
  return 'unknown';
};

/**
 * キャッシュディレクトリのパスを取得
 * @param {string} subdirectory - サブディレクトリ名
 * @returns {string} キャッシュディレクトリのパス
 */
const getCacheDir = (subdirectory = '') => {
  const cacheDir = process.env.CACHE_DIR || DEFAULT_CACHE_DIR;
  const targetDir = subdirectory ? path.join(cacheDir, subdirectory) : cacheDir;

  // ディレクトリが存在しない場合は作成
  fs.ensureDirSync(targetDir);

  return targetDir;
};

/**
 * 一時ファイルのパスを生成
 * @param {string} originalFilename - 元のファイル名
 * @param {string} subdirectory - サブディレクトリ名
 * @returns {string} 一時ファイルのパス
 */
const getTempFilePath = (originalFilename, subdirectory = 'temp') => {
  const ext = path.extname(originalFilename);
  const filename = `${Date.now()}-${generateUniqueId()}${ext}`;
  const tempDir = getCacheDir(subdirectory);

  return path.join(tempDir, filename);
};

/**
 * ディレクトリ内の古いファイルを削除
 * @param {string} directory - ディレクトリパス
 * @param {number} maxAgeMs - 最大保持時間（ミリ秒）
 */
const cleanupOldFiles = async (directory, maxAgeMs = 24 * 60 * 60 * 1000) => {
  try {
    const files = await fs.readdir(directory);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = await fs.stat(filePath);

      // ファイルの最終更新日時を確認
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAgeMs) {
        await fs.remove(filePath);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up old files: ${error.message}`);
  }
};

module.exports = {
  generateUniqueId,
  fileExists,
  getFileType,
  getCacheDir,
  getTempFilePath,
  cleanupOldFiles,
};
