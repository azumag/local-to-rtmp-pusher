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

// アクティブなダウンロードを保持するオブジェクト
const activeDownloads = {};

/**
 * ダウンロードしたファイルが有効かどうかを検証
 * @param {string} filePath - ファイルパス
 * @param {string} filename - ファイル名
 * @returns {Promise<boolean>} ファイルが有効かどうか
 */
const validateDownloadedFile = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);

    // ファイルサイズチェック（極端に小さいファイルは無効とみなす）
    if (stats.size < 1024) {
      // 1KB未満
      console.warn(`File too small: ${stats.size} bytes`);
      return false;
    }

    // ファイルの最初の数バイトを読んでHTMLかどうかチェック
    const buffer = await fs.readFile(filePath, { encoding: null, start: 0, end: 511 });
    const fileHeader = buffer.slice(0, Math.min(buffer.length, 100)).toString('utf8');

    // HTMLコンテンツの検出
    if (
      fileHeader.toLowerCase().includes('<!doctype html') ||
      fileHeader.toLowerCase().includes('<html')
    ) {
      console.warn('File appears to be HTML content, not a media file');
      return false;
    }

    // Google Driveエラーページの検出
    if (fileHeader.includes('Google Drive') && fileHeader.includes('virus')) {
      console.warn('File appears to be Google Drive virus scan warning page');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating file:', error);
    return false;
  }
};

// ダウンロードDBの初期化
const initializeDownloadDb = async () => {
  try {
    if (!(await fileExists(DOWNLOADS_DB_PATH))) {
      await fs.writeJSON(DOWNLOADS_DB_PATH, { downloads: [] });
    }
    return await fs.readJSON(DOWNLOADS_DB_PATH);
  } catch (error) {
    console.warn(`Failed to read downloads.json, recreating: ${error.message}`);
    // JSONファイルが壊れている場合は新しく作成
    const defaultDb = { downloads: [] };
    await fs.writeJSON(DOWNLOADS_DB_PATH, defaultDb);
    return defaultDb;
  }
};

/**
 * ダウンロード情報の保存
 * @param {Object} downloadInfo - ダウンロード情報
 * @returns {Promise<Object>} 保存された情報
 */
const saveDownloadInfo = async (downloadInfo) => {
  try {
    const db = await initializeDownloadDb();

    // dbが正しい構造かチェック
    if (!db || !Array.isArray(db.downloads)) {
      console.warn('Invalid database structure, recreating');
      const defaultDb = { downloads: [] };
      await fs.writeJSON(DOWNLOADS_DB_PATH, defaultDb);
      db.downloads = [];
    }

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

    await writeJSONSafely(DOWNLOADS_DB_PATH, db);
    return existingDownload;
  } catch (error) {
    console.error(`Error saving download info: ${error.message}`);
    // 重要: エラーを投げずに警告だけ出して続行
    console.warn('Download info save failed, continuing without saving');
    return downloadInfo;
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

    // dbが正しい構造かチェック
    if (!db || !Array.isArray(db.downloads)) {
      console.warn('Invalid database structure in getDownloadStatus');
      return null;
    }

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

    // Google Driveからのダウンロード（ウイルススキャン警告を回避）
    let downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    let response = await fetch(downloadUrl);

    // ウイルススキャン警告ページかチェック
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.log('Virus scan warning detected, extracting direct download link...');
      const htmlText = await response.text();

      // 確認付きダウンロードURLを抽出
      const confirmMatch = htmlText.match(
        /action="([^"]*)"[^>]*>.*?name="confirm"\s+value="([^"]*)"/s
      );
      const idMatch = htmlText.match(/name="id"\s+value="([^"]*)"/);
      const exportMatch = htmlText.match(/name="export"\s+value="([^"]*)"/);
      const uuidMatch = htmlText.match(/name="uuid"\s+value="([^"]*)"/);

      if (confirmMatch && idMatch) {
        const baseUrl = confirmMatch[1];
        const confirmValue = confirmMatch[2];
        const idValue = idMatch[1];
        const exportValue = exportMatch ? exportMatch[1] : 'download';
        const uuidValue = uuidMatch ? uuidMatch[1] : '';

        // 直接ダウンロードURLを構築
        downloadUrl = `${baseUrl}?id=${idValue}&export=${exportValue}&confirm=${confirmValue}`;
        if (uuidValue) {
          downloadUrl += `&uuid=${uuidValue}`;
        }

        console.log('Retrying download with direct URL...');
        response = await fetch(downloadUrl);
      } else {
        throw new Error('Failed to extract direct download URL from virus scan warning page');
      }
    }

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

    // ダウンロードされたファイルの検証
    const finalFileSize = fs.statSync(localPath).size;
    const isValidFile = await validateDownloadedFile(localPath);

    if (!isValidFile) {
      console.error(`Downloaded file appears to be invalid: ${localPath}`);
      // 破損ファイルを削除
      try {
        await fs.remove(localPath);
      } catch (removeError) {
        console.error('Failed to remove invalid file:', removeError);
      }
      throw new Error('Downloaded file is invalid or corrupted');
    }

    // ファイル情報をデータベースに登録
    await fileService.saveFileInfo({
      originalName: downloadInfo.filename,
      path: localPath,
      size: finalFileSize,
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
      /\/folders\/([a-zA-Z0-9_-]+)(?:\?|$)/, // フォルダURLから（より柔軟）
      /\/drive\/folders\/([a-zA-Z0-9_-]+)(?:\?|$)/, // 共有URLから（より柔軟）
      /id=([a-zA-Z0-9_-]+)/, // id=パラメータから
      /\/folders\/([a-zA-Z0-9_-]{33})/, // 従来の33文字ID
      /([a-zA-Z0-9_-]{33,})/, // 33文字以上のID
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
    console.log(`Attempting to extract folder ID from URL: ${shareUrl}`);
    const folderId = await extractFolderId(shareUrl);
    console.log(`Extracted folder ID: ${folderId}`);

    // フォルダーがアクセス可能かテスト
    const testUrl = `https://drive.google.com/drive/folders/${folderId}`;
    console.log(`Testing folder access: ${testUrl}`);

    const response = await fetch(testUrl);

    if (!response.ok) {
      throw new Error(
        `フォルダにアクセスできません (ステータス: ${response.status}). 共有設定を確認してください。`
      );
    }

    const html = await response.text();

    // HTMLが適切に取得できているかチェック
    if (html.includes('You need permission') || html.includes('Request access')) {
      throw new Error(
        'フォルダへのアクセス権限がありません。共有設定が「リンクを知っている全ユーザー」になっていることを確認してください。'
      );
    }

    // ファイル情報を抽出するための複数の正規表現パターン
    const filePatterns = [
      /"([\w-]{33,})",\["(.*?)","(.*?)","(.*?)"/g,
      /\["([\w-]{33,})","([^"]*?)","([^"]*?)"/g,
      /"id":"([\w-]{33,})"[^}]*"name":"([^"]*?)"[^}]*"mimeType":"([^"]*?)"/g,
    ];

    const files = [];

    for (const filePattern of filePatterns) {
      let match = filePattern.exec(html);
      while (match !== null) {
        const [, id, name, mimeType] = match;

        // 動画ファイルのみフィルタリング
        if (mimeType && mimeType.startsWith('video/')) {
          files.push({
            id,
            name,
            mimeType,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
          });
        }
        match = filePattern.exec(html);
      }

      // ファイルが見つかった場合は他のパターンを試さない
      if (files.length > 0) break;
    }

    console.log(`Found ${files.length} video files in the folder`);

    if (files.length === 0) {
      throw new Error(
        '指定されたフォルダに動画ファイルが見つかりません。フォルダが空であるか、動画ファイルが含まれていない可能性があります。'
      );
    }

    return files;
  } catch (error) {
    console.error(`Error listing files from share URL: ${error.message}`);
    throw new Error(`Google Driveの共有URLからファイル一覧の取得に失敗しました: ${error.message}`);
  }
};

/**
 * Google Driveファイルのダウンロード
 * @param {string} fileId - Google Drive FileID
 * @returns {Promise<Object>} ダウンロード情報
 */
const downloadFile = async (fileId) => {
  try {
    console.log(`Checking download status for fileId: ${fileId}`);
    // ダウンロード情報を確認
    const existingDownload = await getDownloadStatus(fileId);
    console.log(`Existing download status:`, existingDownload);

    if (existingDownload && existingDownload.status === 'completed') {
      // ファイルが実際に存在するかチェック
      const fileActuallyExists = await fileExists(existingDownload.localPath);
      console.log(`File exists check for ${existingDownload.localPath}: ${fileActuallyExists}`);

      if (fileActuallyExists) {
        // 既にダウンロード済みの場合
        console.log(`Using existing downloaded file: ${existingDownload.localPath}`);
        return existingDownload;
      }
      console.log(`File marked as completed but doesn't exist, will re-download`);
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

    // 既存のダウンロードをチェック
    const existingDownload = await getDownloadStatus(fileId);

    if (existingDownload && existingDownload.status === 'completed') {
      // ファイルが存在するかチェック
      const fileActuallyExists = await fileExists(existingDownload.localPath);

      if (fileActuallyExists) {
        console.log(`Using existing downloaded file: ${existingDownload.localPath}`);
        // 既存のファイルでストリーミング開始
        const streamService = require('./streamService');
        return streamService.startStream({
          ...streamData,
          input: existingDownload.localPath,
          isGoogleDriveFile: true,
        });
      }
    }

    // ダウンロードを開始（非同期）
    console.log(`Starting download for fileId: ${fileId}`);
    const downloadInfo = await downloadFile(fileId);

    // ダウンロードが完了済みの場合はすぐにストリーミング開始
    if (downloadInfo.status === 'completed') {
      const fileActuallyExists = await fileExists(downloadInfo.localPath);

      if (fileActuallyExists) {
        console.log(`Download completed immediately, starting stream`);
        const streamService = require('./streamService');
        return streamService.startStream({
          ...streamData,
          input: downloadInfo.localPath,
          isGoogleDriveFile: true,
        });
      }
    }

    // ダウンロード中の場合は、バックグラウンドで処理を継続
    console.log(`Download in progress, will start streaming when ready`);
    const streamService = require('./streamService');

    // ストリーム情報をすぐに返すが、ダウンロード完了後に実際のストリーミングを開始
    const streamId = require('../utils/fileUtils').generateUniqueId();

    // バックグラウンドでダウンロード完了を待機してストリーミング開始
    setTimeout(async () => {
      try {
        console.log(`Waiting for download completion for fileId: ${fileId}`);
        let waitTime = 0;
        const maxWaitTime = 5 * 60 * 1000; // 5分
        const checkInterval = 3000; // 3秒ごとに確認

        while (waitTime < maxWaitTime) {
          await new Promise((resolve) => {
            setTimeout(resolve, checkInterval);
          });
          waitTime += checkInterval;

          const currentStatus = await getDownloadStatus(fileId);
          if (currentStatus && currentStatus.status === 'completed') {
            const fileActuallyExists = await fileExists(currentStatus.localPath);

            if (fileActuallyExists) {
              console.log(`Download completed, starting delayed stream for fileId: ${fileId}`);
              await streamService.startStream({
                ...streamData,
                input: currentStatus.localPath,
                isGoogleDriveFile: true,
              });
              return;
            }
          } else if (currentStatus && currentStatus.status === 'error') {
            console.error(`Download failed for fileId: ${fileId}: ${currentStatus.errorMessage}`);
            return;
          }

          if (waitTime >= maxWaitTime) {
            console.error(`Download timeout for fileId: ${fileId}`);
            return;
          }
        }
      } catch (error) {
        console.error(`Error in delayed streaming for fileId: ${fileId}:`, error);
      }
    }, 100); // 100ms後に開始

    // 即座にレスポンスを返す
    return {
      id: streamId,
      status: 'preparing',
      message: 'ダウンロード中です。完了次第ストリーミングを開始します。',
      downloadStatus: downloadInfo.status,
      progress: downloadInfo.progress || 0,
      startedAt: new Date().toISOString(),
    };
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
