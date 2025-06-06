const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Constants for configuration values
const CONSTANTS = {
    FOLDER_ID_LENGTH: 8,          // characters to extract from folder ID
    CHUNK_SIZE_KB: 1024,          // KB for chunk calculations
    CHUNK_SIZE_MULTIPLIER: 2,     // multiplier for chunk size
    PROGRESS_INTERVAL: 100,        // progress reporting interval
    BYTES_TO_MB_DIVISOR: 1024,    // for size conversion
    FILE_TTL_MINUTES: 60,         // file time-to-live in minutes
    SECONDS_IN_MINUTE: 60,        // seconds per minute
    MILLISECONDS_IN_SECOND: 1000, // milliseconds per second
    DECIMAL_PRECISION: 50         // divisor for decimal precision (100/50 = 2)
};

class GoogleDriveManager {
    constructor() {
        this.drive = null;
        this.auth = null;
        this.tempDir = path.join(__dirname, 'temp_downloads');
        this.log = {
            info: (msg) => console.log(`[${new Date().toISOString()}] [GoogleDriveManager] [INFO] ${msg}`),
            error: (msg) => console.error(`[${new Date().toISOString()}] [GoogleDriveManager] [ERROR] ${msg}`),
            warning: (msg) => console.warn(`[${new Date().toISOString()}] [GoogleDriveManager] [WARNING] ${msg}`)
        };
        
        this.initializeTempDir();
    }

    /**
     * 一時ディレクトリの初期化
     */
    async initializeTempDir() {
        try {
            await fs.ensureDir(this.tempDir);
            this.log.info(`一時ディレクトリを初期化: ${this.tempDir}`);
        } catch (error) {
            this.log.error(`一時ディレクトリの初期化失敗: ${error.message}`);
        }
    }

    /**
     * Google Drive認証の初期化
     * @param {string} apiKey - Google Drive API Key
     */
    async initializeAuth(apiKey) {
        try {
            this.auth = new google.auth.GoogleAuth({
                credentials: {
                    type: 'authorized_user',
                    // Note: 本番環境では環境変数またはサービスアカウントを使用
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
                },
                scopes: ['https://www.googleapis.com/auth/drive.readonly']
            });

            // APIキーによる認証（公開ファイル用）
            if (apiKey) {
                this.drive = google.drive({
                    version: 'v3',
                    auth: apiKey
                });
            } else {
                // OAuth認証（プライベートファイル用）
                this.drive = google.drive({
                    version: 'v3',
                    auth: this.auth
                });
            }

            this.log.info('Google Drive認証を初期化しました');
            return true;
        } catch (error) {
            this.log.error(`Google Drive認証の初期化失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 共有リンクからフォルダIDを抽出
     * @param {string} link - Google Driveの共有リンク
     * @returns {string|null} フォルダID
     */
    extractFolderIdFromLink(link) {
        try {
            // 様々なGoogle Driveリンク形式に対応
            const patterns = [
                /\/folders\/([a-zA-Z0-9-_]+)/,
                /id=([a-zA-Z0-9-_]+)/,
                /\/drive\/folders\/([a-zA-Z0-9-_]+)/
            ];

            for (const pattern of patterns) {
                const match = link.match(pattern);
                if (match) {
                    return match[1];
                }
            }

            // 直接IDが渡された場合
            if (/^[a-zA-Z0-9-_]+$/.test(link)) {
                return link;
            }

            return null;
        } catch (error) {
            this.log.error(`フォルダID抽出エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * 指定フォルダから動画ファイルリストを取得
     * @param {string} folderId - Google DriveフォルダID
     * @returns {Array} 動画ファイルリスト
     */
    async getVideoFiles(folderId) {
        try {
            if (!this.drive) {
                throw new Error('Google Drive API が初期化されていません');
            }

            this.log.info(`フォルダからファイルリストを取得中: ${folderId}`);

            // 動画ファイルのMIMEタイプ
            const videoMimeTypes = [
                'video/mp4',
                'video/avi',
                'video/mov',
                'video/quicktime',
                'video/x-msvideo',
                'video/webm',
                'video/mkv',
                'video/x-matroska'
            ];

            const response = await this.drive.files.list({
                q: `'${folderId}' in parents and trashed=false and (${videoMimeTypes.map(type => `mimeType='${type}'`).join(' or ')})`,
                fields: 'files(id, name, size, modifiedTime, mimeType, webViewLink)',
                pageSize: 100,
                orderBy: 'name'
            });

            const files = response.data.files || [];
            
            this.log.info(`${files.length}個の動画ファイルを発見`);

            return files.map(file => ({
                id: file.id,
                filename: file.name,
                size: parseInt(file.size) || 0,
                modified: file.modifiedTime,
                mimeType: file.mimeType,
                webViewLink: file.webViewLink,
                source: 'googledrive'
            }));

        } catch (error) {
            this.log.error(`ファイルリスト取得エラー: ${error.message}`);
            throw error;
        }
    }

    /**
     * 指定ファイルを一時的にダウンロード
     * @param {string} fileId - Google DriveファイルID
     * @param {string} filename - ファイル名
     * @returns {string} ダウンロードされたファイルのパス
     */
    async downloadFile(fileId, filename) {
        try {
            if (!this.drive) {
                throw new Error('Google Drive API が初期化されていません');
            }

            // 一意なファイル名を生成
            const uniqueId = uuidv4().substring(0, CONSTANTS.FOLDER_ID_LENGTH);
            const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const localFilename = `${uniqueId}_${safeFilename}`;
            const localPath = path.join(this.tempDir, localFilename);

            this.log.info(`ファイルダウンロード開始: ${filename} -> ${localPath}`);

            // ファイルメタデータ取得
            const fileMetadata = await this.drive.files.get({
                fileId: fileId,
                fields: 'size, name'
            });

            const fileSize = parseInt(fileMetadata.data.size);
            this.log.info(`ファイルサイズ: ${(fileSize / CONSTANTS.BYTES_TO_MB_DIVISOR / CONSTANTS.BYTES_TO_MB_DIVISOR).toFixed(CONSTANTS.PROGRESS_INTERVAL / CONSTANTS.DECIMAL_PRECISION)} MB`);

            // ファイルダウンロード
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, {
                responseType: 'stream'
            });

            // ストリームを使ってファイル保存
            const writeStream = fs.createWriteStream(localPath);
            
            return new Promise((resolve, reject) => {
                let downloadedBytes = 0;
                
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    const progress = ((downloadedBytes / fileSize) * CONSTANTS.PROGRESS_INTERVAL).toFixed(1);
                    if (downloadedBytes % (CONSTANTS.BYTES_TO_MB_DIVISOR * CONSTANTS.BYTES_TO_MB_DIVISOR) < chunk.length) { // 1MB毎にログ
                        this.log.info(`ダウンロード進行: ${progress}% (${(downloadedBytes / CONSTANTS.BYTES_TO_MB_DIVISOR / CONSTANTS.BYTES_TO_MB_DIVISOR).toFixed(1)}MB)`);
                    }
                });

                response.data.on('end', () => {
                    this.log.info(`ダウンロード完了: ${filename}`);
                    resolve(localPath);
                });

                response.data.on('error', (error) => {
                    this.log.error(`ダウンロードエラー: ${error.message}`);
                    fs.remove(localPath).catch(() => {}); // クリーンアップ
                    reject(error);
                });

                response.data.pipe(writeStream);
            });

        } catch (error) {
            this.log.error(`ファイルダウンロードエラー: ${error.message}`);
            throw error;
        }
    }

    /**
     * 一時ファイルを削除
     * @param {string} filePath - 削除するファイルのパス
     */
    async cleanupFile(filePath) {
        try {
            if (filePath && filePath.startsWith(this.tempDir)) {
                await fs.remove(filePath);
                this.log.info(`一時ファイルを削除: ${path.basename(filePath)}`);
            }
        } catch (error) {
            this.log.warning(`一時ファイル削除警告: ${error.message}`);
        }
    }

    /**
     * 古い一時ファイルをクリーンアップ（1時間以上経過）
     */
    async cleanupOldFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const oneHourAgo = Date.now() - (CONSTANTS.FILE_TTL_MINUTES * CONSTANTS.SECONDS_IN_MINUTE * CONSTANTS.MILLISECONDS_IN_SECOND);
            let cleanedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < oneHourAgo) {
                    await fs.remove(filePath);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                this.log.info(`${cleanedCount}個の古い一時ファイルをクリーンアップ`);
            }
        } catch (error) {
            this.log.warning(`一時ファイルクリーンアップ警告: ${error.message}`);
        }
    }

    /**
     * フォルダへのアクセス権限をテスト
     * @param {string} folderId - テストするフォルダID
     * @returns {boolean} アクセス可能かどうか
     */
    async testAccess(folderId) {
        try {
            if (!this.drive) {
                return false;
            }

            await this.drive.files.get({
                fileId: folderId,
                fields: 'id, name'
            });

            return true;
        } catch (error) {
            this.log.warning(`フォルダアクセステスト失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 現在の認証状態を取得
     * @returns {boolean} 認証済みかどうか
     */
    isAuthenticated() {
        return this.drive !== null;
    }

    /**
     * 一時ディレクトリの容量情報を取得
     * @returns {Object} 容量情報
     */
    async getTempDirInfo() {
        try {
            const files = await fs.readdir(this.tempDir);
            let totalSize = 0;
            
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                totalSize += stats.size;
            }

            return {
                fileCount: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / CONSTANTS.BYTES_TO_MB_DIVISOR / CONSTANTS.BYTES_TO_MB_DIVISOR).toFixed(CONSTANTS.PROGRESS_INTERVAL / CONSTANTS.DECIMAL_PRECISION)
            };
        } catch (error) {
            return {
                fileCount: 0,
                totalSize: 0,
                totalSizeMB: '0.00'
            };
        }
    }
}

module.exports = GoogleDriveManager;