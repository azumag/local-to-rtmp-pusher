const fs = require('fs-extra');
const path = require('path');
const { getCacheDir } = require('./fileUtils');

/**
 * Google Driveからダウンロードされたファイルをクリーンアップする
 */
async function cleanupGoogleDriveFiles() {
  try {
    console.log('Google Driveファイルのクリーンアップを開始します...');

    // files.jsonを読み込む
    const FILES_DB_PATH = path.join(getCacheDir(), 'files.json');

    if (!fs.existsSync(FILES_DB_PATH)) {
      console.log('files.jsonが見つかりません。');
      return;
    }

    const files = await fs.readJson(FILES_DB_PATH);

    if (!Array.isArray(files)) {
      console.log('ファイルデータが不正です。');
      return;
    }

    // Google Driveファイルをフィルタリング
    const googleDriveFiles = files.filter((file) => file.source === 'google_drive');
    const localFiles = files.filter((file) => file.source !== 'google_drive');

    console.log(`総ファイル数: ${files.length}`);
    console.log(`Google Driveファイル数: ${googleDriveFiles.length}`);
    console.log(`ローカルファイル数: ${localFiles.length}`);

    // Google Driveファイルを削除
    for (const file of googleDriveFiles) {
      try {
        // ファイルシステムから削除
        if (file.path && fs.existsSync(file.path)) {
          await fs.remove(file.path);
          console.log(`削除: ${file.originalName} (${file.path})`);
        }

        // サムネイルも削除
        const thumbnailDir = getCacheDir('thumbnails');
        const thumbnailPath = path.join(thumbnailDir, `${file.id}.jpg`);
        if (fs.existsSync(thumbnailPath)) {
          await fs.remove(thumbnailPath);
          console.log(`サムネイル削除: ${thumbnailPath}`);
        }
      } catch (error) {
        console.error(`ファイル削除エラー: ${file.originalName}`, error.message);
      }
    }

    // files.jsonを更新（ローカルファイルのみを保持）
    await fs.writeJson(FILES_DB_PATH, localFiles, { spaces: 2 });
    console.log('files.jsonを更新しました。');

    console.log('クリーンアップが完了しました。');
  } catch (error) {
    console.error('クリーンアップエラー:', error);
  }
}

// 直接実行された場合
if (require.main === module) {
  cleanupGoogleDriveFiles();
}

module.exports = { cleanupGoogleDriveFiles };
