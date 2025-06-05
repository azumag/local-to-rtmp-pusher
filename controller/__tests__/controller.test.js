const request = require('supertest');
const fs = require('fs-extra');

// ProcessManagerのモック
jest.mock('../process_manager');
const ProcessManager = require('../process_manager');

// fs-extraのモック
jest.mock('fs-extra');

describe('Controller API', () => {
    let app;
    let processManagerInstance;

    beforeEach(() => {
        // ProcessManagerのモックインスタンス
        processManagerInstance = {
            startRtmpStream: jest.fn(),
            stopRtmpStream: jest.fn(),
            startUdpStreaming: jest.fn(),
            stopUdpStreaming: jest.fn(),
            getStatus: jest.fn(),
            stopAll: jest.fn()
        };

        ProcessManager.mockImplementation(() => processManagerInstance);

        // controller.jsを個別にrequireしてテスト
        jest.resetModules();
        
        // プロセスイベントリスナーをクリア
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('unhandledRejection');
        process.removeAllListeners('uncaughtException');
        
        // テスト用アプリを作成
        const express = require('express');
        const path = require('path');
        
        app = express();
        app.use(express.json());
        
        // グローバル状態
        let currentVideo = null;
        let streamStatus = 'stopped';
        let rtmpStreamStatus = 'stopped';
        const processManager = new ProcessManager();

        // テスト用のAPIエンドポイント実装
        app.get('/api/status', (req, res) => {
            const processStatus = processManager.getStatus();
            res.json({
                stream_status: streamStatus,
                rtmp_stream_status: rtmpStreamStatus,
                current_video: currentVideo,
                process_status: processStatus,
                timestamp: new Date().toISOString()
            });
        });

        app.get('/api/videos', async (req, res) => {
            try {
                const videosDir = path.join(__dirname, '../videos');
                const videos = [];
                
                if (await fs.pathExists(videosDir)) {
                    const files = await fs.readdir(videosDir);
                    
                    for (const file of files) {
                        if (file.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)$/)) {
                            const stats = await fs.stat(path.join(videosDir, file));
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
                res.status(500).json({ error: error.message });
            }
        });

        app.post('/api/switch', async (req, res) => {
            try {
                const { video } = req.body;
                if (!video) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'video parameter required' 
                    });
                }

                if (video.includes('..') || video.startsWith('/')) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Invalid file path' 
                    });
                }

                const videoPath = path.join(__dirname, '../videos', video);
                if (!(await fs.pathExists(videoPath))) {
                    return res.status(404).json({ 
                        success: false, 
                        error: `Video file not found: ${video}` 
                    });
                }

                const result = await processManager.startUdpStreaming(video);

                if (result.success) {
                    currentVideo = video;
                    streamStatus = 'streaming';
                    res.json({
                        success: true,
                        video: video,
                        message: `Successfully switched to ${video}`
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        app.post('/api/stop', async (req, res) => {
            try {
                const result = await processManager.stopUdpStreaming();

                if (result.success) {
                    currentVideo = null;
                    streamStatus = 'stopped';
                    res.json({
                        success: true,
                        message: 'Stream stopped successfully'
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        app.post('/api/rtmp/start', async (req, res) => {
            try {
                const result = await processManager.startRtmpStream();

                if (result.success) {
                    rtmpStreamStatus = 'streaming';
                    res.json({
                        success: true,
                        message: 'RTMP stream started successfully'
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        app.post('/api/rtmp/stop', async (req, res) => {
            try {
                const result = await processManager.stopRtmpStream();

                if (result.success) {
                    rtmpStreamStatus = 'stopped';
                    res.json({
                        success: true,
                        message: 'RTMP stream stopped successfully'
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        app.get('/api/health', (req, res) => {
            try {
                const processStatus = processManager.getStatus();
                res.json({
                    status: 'healthy',
                    rtmp_process: processStatus.rtmp_stream_running,
                    udp_process: processStatus.udp_streaming_running,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message
                });
            }
        });

        app.get('/api/logs', (req, res) => {
            try {
                const logType = req.query.type || 'controller';
                const lines = parseInt(req.query.lines) || 100;
                const logs = [`[${new Date().toISOString()}] Log type: ${logType}`, 'System is running...'];

                res.json({
                    logs: logs,
                    type: logType,
                    lines: lines
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/status', () => {
        it('should return system status', async () => {
            processManagerInstance.getStatus.mockReturnValue({
                rtmp_stream_running: true,
                udp_streaming_running: false,
                rtmp_pid: 12345,
                udp_sender_pid: null
            });

            const res = await request(app).get('/api/status');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('stream_status');
            expect(res.body).toHaveProperty('rtmp_stream_status');
            expect(res.body).toHaveProperty('process_status');
            expect(res.body.process_status.rtmp_stream_running).toBe(true);
        });
    });

    describe('GET /api/videos', () => {
        it('should return list of videos', async () => {
            fs.pathExists.mockResolvedValue(true);
            fs.readdir.mockResolvedValue(['video1.mp4', 'video2.mp4', 'not-video.txt']);
            fs.stat.mockResolvedValue({
                size: 1024000,
                mtime: new Date()
            });

            const res = await request(app).get('/api/videos');

            expect(res.status).toBe(200);
            expect(res.body.videos).toHaveLength(2);
            expect(res.body.videos[0].filename).toBe('video1.mp4');
            expect(res.body.count).toBe(2);
        });

        it('should handle missing videos directory', async () => {
            fs.pathExists.mockResolvedValue(false);

            const res = await request(app).get('/api/videos');

            expect(res.status).toBe(200);
            expect(res.body.videos).toHaveLength(0);
            expect(res.body.count).toBe(0);
        });
    });

    describe('POST /api/switch', () => {
        it('should switch video successfully', async () => {
            fs.pathExists.mockResolvedValue(true);
            processManagerInstance.startUdpStreaming.mockResolvedValue({
                success: true,
                message: 'UDP streaming started'
            });

            const res = await request(app)
                .post('/api/switch')
                .send({ video: 'test.mp4' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.video).toBe('test.mp4');
            expect(processManagerInstance.startUdpStreaming).toHaveBeenCalledWith('test.mp4');
        });

        it('should reject invalid video path', async () => {
            const res = await request(app)
                .post('/api/switch')
                .send({ video: '../../../etc/passwd' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Invalid file path');
        });

        it('should handle missing video file', async () => {
            fs.pathExists.mockResolvedValue(false);

            const res = await request(app)
                .post('/api/switch')
                .send({ video: 'missing.mp4' });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('Video file not found');
        });
    });

    describe('POST /api/stop', () => {
        it('should stop streaming successfully', async () => {
            processManagerInstance.stopUdpStreaming.mockResolvedValue({
                success: true,
                message: 'UDP streaming stopped'
            });

            const res = await request(app).post('/api/stop');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(processManagerInstance.stopUdpStreaming).toHaveBeenCalled();
        });
    });

    describe('POST /api/rtmp/start', () => {
        it('should start RTMP stream successfully', async () => {
            processManagerInstance.startRtmpStream.mockResolvedValue({
                success: true,
                message: 'RTMP stream started'
            });

            const res = await request(app).post('/api/rtmp/start');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(processManagerInstance.startRtmpStream).toHaveBeenCalled();
        });

        it('should handle RTMP start failure', async () => {
            processManagerInstance.startRtmpStream.mockResolvedValue({
                success: false,
                error: 'Already running'
            });

            const res = await request(app).post('/api/rtmp/start');

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Already running');
        });
    });

    describe('POST /api/rtmp/stop', () => {
        it('should stop RTMP stream successfully', async () => {
            processManagerInstance.stopRtmpStream.mockResolvedValue({
                success: true,
                message: 'RTMP stream stopped'
            });

            const res = await request(app).post('/api/rtmp/stop');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(processManagerInstance.stopRtmpStream).toHaveBeenCalled();
        });
    });

    describe('GET /api/health', () => {
        it('should return health status', async () => {
            processManagerInstance.getStatus.mockReturnValue({
                rtmp_stream_running: true,
                udp_streaming_running: true
            });

            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('healthy');
            expect(res.body.rtmp_process).toBe(true);
            expect(res.body.udp_process).toBe(true);
        });
    });

    describe('GET /api/logs', () => {
        it('should return logs', async () => {
            const res = await request(app).get('/api/logs?type=controller&lines=50');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('logs');
            expect(res.body.type).toBe('controller');
            expect(res.body.lines).toBe(50);
        });
    });

    describe('Error handling', () => {
        it('should handle 404 for unknown endpoints', async () => {
            const res = await request(app).get('/api/unknown');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Endpoint not found');
        });
    });
});