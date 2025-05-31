const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);
const { getCacheDir, generateUniqueId, fileExists } = require('../utils/fileUtils');
const fileService = require('./fileService');

// ダウンロード情報の保存先
const DOWNLOADS_DB_PATH = path.join(getCacheDir(), 'downloads.json');

// アクティブなダウンロードを保持するオブジェクト
const activeDownloads = {};

// ダウンロードDBの初期化
const initializeDownloadDb = async () => {
  if (!(await fileExists(DOWNLOADS_DB_PATH))) {
    await fs.writeJSON(DOWNLOADS_DB_PATH, { downloads: [] });
  }
  return fs.readJSON(DOWNLOADS_DB_PATH);
};

/**
 * ダウンロード情報の保存
 * @param {Object} downloadInfo - ダウンロード情報
 * @returns {Promise<Object>} 保存された情報
 */
const saveDownloadInfo = async (downloadInfo) => {
  try {
    const db = await initializeDownloadDb();

    let existingDownload = null;
    if (downloadInfo.id) {
      existingDownload = db.downloads.find((d) => d.id === downloadInfo.id);
    }

    if (existingDownload) {
      // 既存のダウンロード情報を更新
      Object.assign(existingDownload, downloadInfo);
      existingDownload.updatedAt = new Date().toISOString();
    } else {
      // 新しいダウンロード情報を追加
      const downloadId = downloadInfo.id || generateUniqueId();
      const newDownload = {
        id: downloadId,
        ...downloadInfo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.downloads.push(newDownload);
      existingDownload = newDownload;
    }

    await fs.writeJSON(DOWNLOADS_DB_PATH, db);
    return existingDownload;
  } catch (error) {
    console.error(`Error saving download info: ${error.message}`);
    throw new Error('ダウンロード情報の保存に失敗しました');
  }
};

/**
 * ダウンロードステータスの取得
 * @param {string} fileId - Google Drive FileID
 * @returns {Promise<Object|null>} ダウンロード情報
 */
const getDownloadStatus = async (fileId) => {
  try {
    const db = await initializeDownloadDb();

    // 最新のダウンロード情報を探す
    const downloads = db.downloads
      .filter((d) => d.fileId === fileId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (downloads.length === 0) {
      return null;
    }

    const downloadInfo = downloads[0];

    // アクティブなダウンロードの場合は現在の進捗を反映
    const activeDownload = Object.values(activeDownloads).find((d) => d.fileId === fileId);

    if (activeDownload) {
      return {
        ...downloadInfo,
        ...activeDownload,
      };
    }

    return downloadInfo;
  } catch (error) {
    console.error(`Error getting download status: ${error.message}`);
    return null;
  }
};

/**
 * 非同期でファイルをダウンロード
 * @param {string} fileId - Google Drive FileID
 * @param {string} localPath - ダウンロード先パス
 * @param {Object} downloadInfo - ダウンロード情報
 */
const downloadFileAsync = async (fileId, localPath, downloadInfo) => {
  try {
    const { id: downloadId } = downloadInfo;

    // ダウンロードの進捗を追跡するための変数
    let receivedBytes = 0;
    const totalBytes = downloadInfo.size || 0;

    // Google Driveからのダウンロード
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    // ストリームを作成して進捗を監視
    const fileStream = fs.createWriteStream(localPath);

    // 進捗更新用のトラッキング処理
    response.body.on('data', (chunk) => {
      receivedBytes += chunk.length;

      if (totalBytes > 0) {
        const progress = Math.floor((receivedBytes / totalBytes) * 100);

        // ダウンロード情報を更新
        activeDownloads[downloadId] = {
          ...downloadInfo,
          progress,
          receivedBytes,
        };

        // 10%ごとに進捗を保存
        if (progress % 10 === 0) {
          saveDownloadInfo({
            ...downloadInfo,
            progress,
            receivedBytes,
          });
        }
      }
    });

    // ストリームをパイプして保存
    await streamPipeline(response.body, fileStream);

    // ダウンロード完了を保存
    const updatedInfo = {
      ...downloadInfo,
      status: 'completed',
      progress: 100,
      completedAt: new Date().toISOString(),
    };

    await saveDownloadInfo(updatedInfo);

    // ファイル情報をデータベースに登録
    await fileService.saveFileInfo({
      originalName: downloadInfo.filename,
      path: localPath,
      size: totalBytes || fs.statSync(localPath).size,
      source: 'google_drive',
      sourceId: fileId,
    });

    // アクティブなダウンロードから削除
    delete activeDownloads[downloadInfo.id];

    return updatedInfo;
  } catch (error) {
    console.error(`Error in async download: ${error.message}`);

    // エラー情報を保存
    await saveDownloadInfo({
      ...downloadInfo,
      status: 'error',
      errorMessage: error.message,
      endedAt: new Date().toISOString(),
    });

    // アクティブなダウンロードから削除
    delete activeDownloads[downloadInfo.id];

    return null;
  }
};

/**
 * Google Drive共有URLからフォルダIDを抽出
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {Promise<string>} フォルダID
 */
const extractFolderId = async (shareUrl) => {
  try {
    // URLからフォルダIDを抽出するための正規表現パターン
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]{33})/, // フォルダURLから
      /\/drive\/folders\/([a-zA-Z0-9_-]{33})/, // 共有URLから
      /id=([a-zA-Z0-9_-]{33})/, // id=パラメータから
      /([a-zA-Z0-9_-]{33})/, // 単純なIDだけの場合
    ];

    for (const pattern of patterns) {
      const match = shareUrl.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    throw new Error('Google DriveのフォルダIDを抽出できませんでした');
  } catch (error) {
    console.error(`Error extracting folder ID: ${error.message}`);
    throw new Error('共有URLからフォルダIDの抽出に失敗しました');
  }
};

/**
 * Google Drive FileIDからファイル情報を取得
 * @param {string} fileId - Google Drive FileID
 * @returns {Promise<Object>} ファイル情報
 */
const getFileInfo = async (fileId) => {
  try {
    // Google Drive APIを使わずに直接ファイル情報を取得する方法
    // 注: これは公開共有されたファイルでのみ動作します
    const response = await fetch(`https://drive.google.com/uc?export=view&id=${fileId}&confirm=t`, {
      method: 'HEAD',
    });

    if (!response.ok) {
      throw new Error('ファイルが見つかりません');
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    const contentDisposition = response.headers.get('content-disposition');

    let filename = 'unknown';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
      if (filenameMatch && filenameMatch[1]) {
        [, filename] = filenameMatch;
      }
    }

    return {
      id: fileId,
      name: filename,
      mimeType: contentType,
      size: contentLength ? parseInt(contentLength, 10) : 0,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    };
  } catch (error) {
    console.error(`Error getting file info: ${error.message}`);
    throw new Error('Google Driveファイル情報の取得に失敗しました');
  }
};

/**
 * Google Drive共有URLからファイル一覧を取得
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {Promise<Array>} ファイル一覧
 */
const listFilesFromShareUrl = async (shareUrl) => {
  try {
    const folderId = await extractFolderId(shareUrl);

    // 注: 本来なら公式のGoogle Drive APIを使用すべきですが、
    // 簡易的な方法として共有されたフォルダのHTMLから情報を抽出します
    const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`);
    const html = await response.text();

    // ファイル情報を抽出するための正規表現
    const filePattern = /"([\w-]{33})",\["(.*?)","(.*?)","(.*?)"/g;

    const files = [];
    let match = filePattern.exec(html);

    while (match !== null) {
      const [, id, name, mimeType] = match;

      // 動画ファイルのみフィルタリング
      if (mimeType.startsWith('video/')) {
        files.push({
          id,
          name,
          mimeType,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
        });
      }
      match = filePattern.exec(html);
    }

    return files;
  } catch (error) {
    console.error(`Error listing files from share URL: ${error.message}`);
    throw new Error('Google Driveの共有URLからファイル一覧の取得に失敗しました');
  }
};

/**
 * Google Driveファイルのダウンロード
 * @param {string} fileId - Google Drive FileID
 * @returns {Promise<Object>} ダウンロード情報
 */
const downloadFile = async (fileId) => {
  try {
    // ダウンロード情報を確認
    const existingDownload = await getDownloadStatus(fileId);
    if (existingDownload && existingDownload.status === 'completed') {
      // 既にダウンロード済みの場合
      return existingDownload;
    }

    // ファイル情報を取得
    const fileInfo = await getFileInfo(fileId);

    // ダウンロード先のパスを設定
    const downloadDir = getCacheDir('downloads');
    const filename = fileInfo.name || `gdrive-${fileId}`;
    const localPath = path.join(downloadDir, `${Date.now()}-${filename}`);

    // ダウンロード情報を登録
    const downloadId = generateUniqueId();
    const downloadInfo = {
      id: downloadId,
      fileId,
      filename,
      localPath,
      status: 'downloading',
      progress: 0,
      startedAt: new Date().toISOString(),
      size: fileInfo.size,
    };

    await saveDownloadInfo(downloadInfo);

    // 非同期でダウンロード開始
    downloadFileAsync(fileId, localPath, downloadInfo).catch((error) => {
      console.error(`Async download error: ${error.message}`);
    });

    return downloadInfo;
  } catch (error) {
    console.error(`Error downloading file: ${error.message}`);
    throw new Error('Google Driveファイルのダウンロードに失敗しました');
  }
};

/**
 * Google Driveファイルを直接ストリーミング
 * @param {Object} streamData - ストリーム設定
 * @returns {Promise<Object>} ストリーム情報
 */
const streamFile = async (streamData) => {
  try {
    const { fileId } = streamData;

    // まずファイルをダウンロード
    const downloadInfo = await downloadFile(fileId);

    // ダウンロードが完了するまで待機
    if (downloadInfo.status === 'downloading') {
      // 最大5分待機
      let waitTime = 0;
      const maxWaitTime = 5 * 60 * 1000; // 5分
      const checkInterval = 3000; // 3秒ごとに確認

      while (waitTime < maxWaitTime) {
        await new Promise((resolve) => {
          setTimeout(resolve, checkInterval);
        });
        waitTime += checkInterval;

        const currentStatus = await getDownloadStatus(fileId);
        if (!currentStatus) {
          throw new Error('ダウンロード情報が見つかりません');
        }

        if (currentStatus.status === 'completed') {
          // ダウンロード完了
          break;
        } else if (currentStatus.status === 'error') {
          // ダウンロードエラー
          throw new Error(`ダウンロードエラー: ${currentStatus.errorMessage || '不明なエラー'}`);
        }

        if (waitTime >= maxWaitTime) {
          throw new Error('ダウンロードのタイムアウト');
        }
      }
    } else if (downloadInfo.status === 'error') {
      throw new Error(`ダウンロードエラー: ${downloadInfo.errorMessage || '不明なエラー'}`);
    }

    // ストリーミング開始
    const streamService = require('./streamService');
    return streamService.startStream({
      ...streamData,
      fileId: downloadInfo.localPath, // ローカルパスを使用
      isGoogleDriveFile: false, // すでにローカルにダウンロード済み
    });
  } catch (error) {
    console.error(`Error streaming file: ${error.message}`);
    throw new Error(`Google Driveファイルのストリーミングに失敗しました: ${error.message}`);
  }
};

module.exports = {
  extractFolderId,
  getFileInfo,
  listFilesFromShareUrl,
  downloadFile,
  getDownloadStatus,
  streamFile,
};
