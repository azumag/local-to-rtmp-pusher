#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const ProcessManager = require('./process_manager');

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
let streamStatus = 'stopped';
let rtmpStreamStatus = 'stopped';
let relayStatus = 'stopped';
let currentRelayUrl = null;
let processManager = null;

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
                rtmp_stream_status: 'error',
                current_video: null,
                error: 'ProcessManager not initialized'
            });
        }

        const processStatus = processManager.getStatus();
        
        res.json({
            stream_status: streamStatus,
            rtmp_stream_status: rtmpStreamStatus,
            relay_status: relayStatus,
            current_video: currentVideo,
            current_relay_url: currentRelayUrl,
            process_status: processStatus,
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
                        modified: stats.mtime.toISOString()
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

        const { video } = req.body;
        if (!video) {
            return res.status(400).json({ 
                success: false, 
                error: 'video parameter required' 
            });
        }

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

        log.info(`動画切り替え開始: ${currentVideo} → ${video}`);

        // UDPストリーミング開始
        const result = await processManager.startUdpStreaming(video);

        if (result.success) {
            currentVideo = video;
            streamStatus = 'streaming';
            log.info(`動画切り替え完了: ${video}`);
            
            res.json({
                success: true,
                video: video,
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

// RTMPストリーム開始
app.post('/api/rtmp/start', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const result = await processManager.startRtmpStream();

        if (result.success) {
            rtmpStreamStatus = 'streaming';
            log.info('RTMPストリーム開始完了');
            
            res.json({
                success: true,
                message: 'RTMP stream started successfully'
            });
        } else {
            log.error(`RTMPストリーム開始失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`RTMP start API error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// RTMPストリーム停止
app.post('/api/rtmp/stop', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const result = await processManager.stopRtmpStream();

        if (result.success) {
            rtmpStreamStatus = 'stopped';
            log.info('RTMPストリーム停止完了');
            
            res.json({
                success: true,
                message: 'RTMP stream stopped successfully'
            });
        } else {
            log.error(`RTMPストリーム停止失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`RTMP stop API error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// RTMPリレー開始
app.post('/api/relay/start', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const { relayUrl, encodingSettings } = req.body;
        if (!relayUrl) {
            return res.status(400).json({ 
                success: false, 
                error: 'relayUrl parameter required' 
            });
        }

        // URLバリデーション
        try {
            const url = new URL(relayUrl);
            if (url.protocol !== 'rtmp:') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid RTMP URL' 
                });
            }
        } catch (e) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid URL format' 
            });
        }

        const result = await processManager.startRelay(relayUrl, encodingSettings);

        if (result.success) {
            relayStatus = 'streaming';
            currentRelayUrl = relayUrl;
            log.info(`RTMPリレー開始完了: ${relayUrl}`);
            
            res.json({
                success: true,
                message: result.message,
                settings: result.settings
            });
        } else {
            log.error(`RTMPリレー開始失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`Relay start API error: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// RTMPリレー停止
app.post('/api/relay/stop', async (req, res) => {
    try {
        if (!processManager) {
            return res.status(500).json({ 
                success: false, 
                error: 'ProcessManager not initialized' 
            });
        }

        const result = await processManager.stopRelay();

        if (result.success) {
            relayStatus = 'stopped';
            currentRelayUrl = null;
            log.info('RTMPリレー停止完了');
            
            res.json({
                success: true,
                message: result.message
            });
        } else {
            log.error(`RTMPリレー停止失敗: ${result.error}`);
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        log.error(`Relay stop API error: ${error.message}`);
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
            rtmp_process: processStatus.rtmp_stream_running,
            udp_process: processStatus.udp_streaming_running,
            relay_process: processStatus.relay_running,
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

    log.info('システム初期化完了');

    const port = process.env.PORT || 8080;
    app.listen(port, '0.0.0.0', () => {
        log.info(`サーバーが起動しました: http://0.0.0.0:${port}`);
        log.info('Web UI: http://localhost:8080');
        log.info('pocスタイルのコントロール:');
        log.info('1. RTMPストリーム開始: POST /api/rtmp/start');
        log.info('2. 動画選択・UDP送信: POST /api/switch');
        log.info('3. ストリーム停止: POST /api/stop, POST /api/rtmp/stop');
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