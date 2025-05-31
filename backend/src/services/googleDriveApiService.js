const { google } = require('googleapis');

// Google Drive APIクライアントの初期化
// 注意: 公開フォルダへのアクセスのみなので、APIキーのみ使用
const apiKey = process.env.GOOGLE_API_KEY || 'AIzaSyCgKZwTpqCW3JaJH3viEHTk4GTwDcroyKs';
console.log(
  `[googleDriveApiService] Google Drive API initialized with key: ${apiKey ? 'Present' : 'Missing'}`
);

const drive = google.drive({
  version: 'v3',
  auth: apiKey,
});

/**
 * フォルダIDを使用してファイル一覧を取得
 * @param {string} folderId - Google DriveフォルダID
 * @returns {Promise<Array>} ファイル一覧
 */
const listFilesInFolder = async (folderId) => {
  console.log(`[googleDriveApiService] Listing files in folder: ${folderId}`);
  try {
    const queryParams = {
      q: `'${folderId}' in parents and mimeType contains 'video/'`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };
    console.log(`[googleDriveApiService] API Query Params: ${JSON.stringify(queryParams)}`);
    const response = await drive.files.list(queryParams);
    console.log(`[googleDriveApiService] Raw API Response Data: ${JSON.stringify(response.data)}`);
    console.log(
      `[googleDriveApiService] API response received for folder ${folderId}. Files found: ${response.data.files.length}`
    );

    return response.data.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
    }));
  } catch (error) {
    console.error(`[googleDriveApiService] Google Drive API error: ${error.message}`);
    console.error(
      `[googleDriveApiService] Error details: ${JSON.stringify(error.errors || error)}`
    );

    // APIキーが無効な場合やアクセス権限がない場合のエラーハンドリング
    if (error.code === 403) {
      throw new Error(
        'Google Drive API: フォルダへのアクセス権限がありません。共有設定を確認してください。'
      );
    } else if (error.code === 404) {
      throw new Error('Google Drive API: フォルダが見つかりません。URLを確認してください。');
    } else {
      throw new Error(`Google Drive APIエラー: ${error.message}`);
    }
  }
};

/**
 * Google Drive共有URLからフォルダIDを抽出
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {string} フォルダID
 */
const extractFolderId = (shareUrl) => {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+?)(?:\?|$)/,
    /\/drive\/folders\/([a-zA-Z0-9_-]+?)(?:\?|$)/,
    /\/open\?id=([a-zA-Z0-9_-]+?)(?:&|$)/,
    /id=([a-zA-Z0-9_-]+?)(?:&|$)/,
    /\/d\/([a-zA-Z0-9_-]+?)\//,
  ];

  for (const pattern of patterns) {
    const match = shareUrl.match(pattern);
    if (match && match[1] && match[1].length >= 15) {
      return match[1];
    }
  }

  throw new Error('Google DriveのフォルダIDを抽出できませんでした');
};

/**
 * Google Drive共有URLからファイル一覧を取得
 * @param {string} shareUrl - Google Drive共有URL
 * @returns {Promise<Array>} ファイル一覧
 */
const listFilesFromShareUrl = async (shareUrl) => {
  console.log(`Google Drive API: Processing URL: ${shareUrl}`);

  try {
    console.log('Google Drive API: Extracting folder ID...');
    const folderId = extractFolderId(shareUrl);
    console.log(`Google Drive API: Extracted folder ID: ${folderId}`);

    console.log('Google Drive API: Calling listFilesInFolder...');
    const files = await listFilesInFolder(folderId);
    console.log(`Google Drive API: Found ${files.length} files`);

    return files;
  } catch (error) {
    console.error(`Google Drive API error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  listFilesFromShareUrl,
  extractFolderId,
};
