#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const ProcessManager = require('./process_manager');
const GoogleDriveManager = require('./google_drive_manager');

// ロガー設定
const log = {
    info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
    error: (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
    warning: (msg) => console.warn(`[${new Date().toISOString()}] [WARNING] ${msg}`)
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'templates')));

// グローバル状態
let currentVideo = null;
let currentVideoSource = 'local'; // 'local' または 'googledrive'
let streamStatus = 'stopped';
let processManager = null;
let googleDriveManager = null;

// ProcessManager初期化
async function initializeProcessManager() {
    try {
        log.info('ProcessManager初期化開始...');
        processManager = new ProcessManager();
        log.info('ProcessManager初期化成功');
        return true;
    } catch (error) {
        log.error(`ProcessManager初期化失敗: ${error.message}`);
        return false;
    }
}

// GoogleDriveManager初期化
async function initializeGoogleDriveManager() {
    try {
        log.info('GoogleDriveManager初期化開始...');
        googleDriveManager = new GoogleDriveManager();
        
        // 環境変数またはAPIキーで認証を試行
        const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
        if (apiKey || process.env.GOOGLE_CLIENT_ID) {
            await googleDriveManager.initializeAuth(apiKey);
            log.info('GoogleDriveManager初期化成功');
        } else {
            log.warning('Google Drive認証情報が設定されていません');
        }
        
        return true;
    } catch (error) {
        log.error(`GoogleDriveManager初期化失敗: ${error.message}`);
        return false;
    }
}

// メイン画面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// 配信状況取得
app.get('/api/status', async (req, res) => {
    try {
        if (!processManager) {
            return res.json({
                stream_status: 'error',
                current_video: null,
                error: 'ProcessManager not initialized'
            });
        }

        const processStatus = processManager.getStatus();
        
        res.json({
            stream_status: streamStatus,
            current_video: currentVideo,
            current_video_source: currentVideoSource,
            process_status: processStatus,
            googledrive_available: googleDriveManager && googleDriveManager.isAuthenticated(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error(`Status API error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 利用可能動画一覧
app.get('/api/videos', async (req, res) => {
    try {
        const videosDir = path.join(__dirname, 'videos');
        const videos = [];
        
        if (await fs.pathExists(videosDir)) {
            const files = await fs.readdir(videosDir);
            
            for (const file of files) {
                if (file.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)$/)) {
                    const filePath = path.join(videosDir, file);
                    const stats = await fs.stat(filePath);
                    
                    videos.push({
                        filename: file,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        source: 'local'
                    });
                }
            }
        }
        
        res.json({
            videos: videos.sort((a, b) => a.filename.localeCompare(b.filename)),
            count: videos.length
        });
    } catch (error) {
        log.error(`Videos API error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 動画切り替え（UDPストリーミング開始）
app.post('/api/switch', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const { video, source = 'local', googledriveFileId } = req.body;
        if (!video) {
            return res.status(400).json({ 
                success: false, 
                error: 'video parameter required' 
            });
        }

        let result;

        if (source === 'googledrive') {
            // Google Driveファイルの処理
            if (!googleDriveManager || !googleDriveManager.isAuthenticated()) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Google Drive not available or not authenticated' 
                });
            }

            if (!googledriveFileId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'googledriveFileId parameter required for Google Drive videos' 
                });
            }

            log.info(`Google Drive動画ダウンロード開始: ${video} (ID: ${googledriveFileId})`);

            try {
                // Google Driveからファイルをダウンロード
                const tempFilePath = await googleDriveManager.downloadFile(googledriveFileId, video);
                
                log.info(`Google Drive動画ダウンロード完了、ストリーミング開始: ${video}`);
                
                // 一時ファイルからUDPストリーミング開始
                result = await processManager.startUdpStreamingFromPath(tempFilePath, video, tempFilePath);
                
                if (result.success) {
                    currentVideo = video;
                    currentVideoSource = 'googledrive';
                    streamStatus = 'streaming';
                }
                
            } catch (downloadError) {
                log.error(`Google Drive動画ダウンロードエラー: ${downloadError.message}`);
                return res.status(500).json({
                    success: false,
                    error: `Google Drive download failed: ${downloadError.message}`
                });
            }

        } else {
            // ローカルファイルの処理
            // ファイル存在確認
            const videoPath = path.join(__dirname, 'videos', video);
            if (!(await fs.pathExists(videoPath))) {
                return res.status(404).json({ 
                    success: false, 
                    error: `Video file not found: ${video}` 
                });
            }

            // パス検証（セキュリティ）
            if (video.includes('..') || video.startsWith('/')) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid file path' 
                });
            }

            log.info(`ローカル動画切り替え開始: ${currentVideo} → ${video}`);

            // UDPストリーミング開始
            result = await processManager.startUdpStreaming(video);

            if (result.success) {
                currentVideo = video;
                currentVideoSource = 'local';
                streamStatus = 'streaming';
            }
        }

        if (result.success) {
            log.info(`動画切り替え完了: ${video} (source: ${source})`);
            
            res.json({
                success: true,
                video: video,
                source: source,
                message: `Successfully switched to ${video}`
            });
        } else {
            log.error(`動画切り替え失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`Switch API error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 配信停止（UDPストリーミング停止）
app.post('/api/stop', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const result = await processManager.stopUdpStreaming();

        if (result.success) {
            currentVideo = null;
            currentVideoSource = 'local';
            streamStatus = 'stopped';
            log.info('配信停止完了');
            
            res.json({
                success: true,
                message: 'Stream stopped successfully'
            });
        } else {
            log.error(`配信停止失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`Stop API error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Google Drive フォルダからファイルリスト取得
app.post('/api/googledrive/files', async (req, res) => {
    try {
        if (!googleDriveManager || !googleDriveManager.isAuthenticated()) {
            return res.status(500).json({
                success: false,
                error: 'Google Drive not available or not authenticated'
            });
        }

        const { folderLink } = req.body;
        if (!folderLink) {
            return res.status(400).json({
                success: false,
                error: 'folderLink parameter required'
            });
        }

        // フォルダIDを抽出
        const folderId = googleDriveManager.extractFolderIdFromLink(folderLink);
        if (!folderId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Google Drive folder link or ID'
            });
        }

        log.info(`Google Driveフォルダからファイルリスト取得: ${folderId}`);

        // フォルダアクセステスト
        const hasAccess = await googleDriveManager.testAccess(folderId);
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Cannot access the specified folder. Check if the folder is public or sharing settings.'
            });
        }

        // ファイルリスト取得
        const files = await googleDriveManager.getVideoFiles(folderId);

        res.json({
            success: true,
            files: files,
            count: files.length,
            folderId: folderId
        });

    } catch (error) {
        log.error(`Google Drive files API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Google Drive認証状態確認
app.get('/api/googledrive/status', async (req, res) => {
    try {
        const isAuthenticated = googleDriveManager && googleDriveManager.isAuthenticated();
        const tempDirInfo = isAuthenticated ? await googleDriveManager.getTempDirInfo() : null;

        res.json({
            authenticated: isAuthenticated,
            tempDir: tempDirInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error(`Google Drive status API error: ${error.message}`);
        res.status(500).json({
            error: error.message
        });
    }
});

// Google Drive一時ファイルクリーンアップ
app.post('/api/googledrive/cleanup', async (req, res) => {
    try {
        if (!googleDriveManager) {
            return res.status(500).json({
                success: false,
                error: 'Google Drive not available'
            });
        }

        await googleDriveManager.cleanupOldFiles();

        res.json({
            success: true,
            message: 'Cleanup completed'
        });
    } catch (error) {
        log.error(`Google Drive cleanup API error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ヘルスチェック
app.get('/api/health', async (req, res) => {
    try {
        if (!processManager) {
            return res.json({
                status: 'error',
                error: 'ProcessManager not initialized'
            });
        }

        const processStatus = processManager.getStatus();

        res.json({
            status: 'healthy',
            udp_process: processStatus.udp_streaming_running,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error(`Health API error: ${error.message}`);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// ログ取得
app.get('/api/logs', async (req, res) => {
    try {
        const logType = req.query.type || 'controller';
        const lines = parseInt(req.query.lines) || 100;

        // シンプルなログ実装 - 実際にはファイルから読み込むかメモリに保存
        const logs = [`[${new Date().toISOString()}] Log type: ${logType}`, 'System is running...'];

        res.json({
            logs: logs,
            type: logType,
            lines: lines
        });
    } catch (error) {
        log.error(`Logs API error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// エラーハンドラー
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, _next) => {
    log.error(`Express error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// サーバー起動
async function startServer() {
    log.info('UDP配信システム制御コントローラー起動中...');
    
    // ProcessManager初期化
    const processInitialized = await initializeProcessManager();
    if (!processInitialized) {
        log.warning('ProcessManagerの初期化に失敗しましたが、サーバーを起動します');
    }

    // GoogleDriveManager初期化
    const googleDriveInitialized = await initializeGoogleDriveManager();
    if (!googleDriveInitialized) {
        log.warning('GoogleDriveManagerの初期化に失敗しましたが、サーバーを起動します');
    }

    log.info('システム初期化完了');

    const port = process.env.PORT || 8080;
    app.listen(port, '0.0.0.0', () => {
        log.info(`サーバーが起動しました: http://0.0.0.0:${port}`);
        log.info('Web UI: http://localhost:8080');
        log.info('UDP配信システムコントロール:');
        log.info('1. 動画選択・UDP送信: POST /api/switch');
        log.info('2. ストリーム停止: POST /api/stop');
    });
}

// グレースフルシャットダウン
process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    log.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// 未処理エラーのキャッチ
process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
    log.error(`Uncaught Exception: ${error.message}`);
    process.exit(1);
});

// サーバー起動
startServer().catch((error) => {
    log.error(`Failed to start server: ${error.message}`);
    process.exit(1);
});