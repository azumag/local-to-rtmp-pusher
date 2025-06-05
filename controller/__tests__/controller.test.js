const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs-extra');

// Mock fs-extra
jest.mock('fs-extra');

// Mock ProcessManager
jest.mock('../process_manager', () => {
    return jest.fn().mockImplementation(() => ({
        startUdpStreaming: jest.fn(),
        stopUdpStreaming: jest.fn(),
        getStatus: jest.fn(),
        stopAll: jest.fn()
    }));
});

describe('Controller API Tests', () => {
    let app;
    let processManager;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Create fresh app instance for each test
        app = express();
        app.use(express.json());

        // Mock ProcessManager instance
        const ProcessManager = require('../process_manager');
        processManager = new ProcessManager();

        // Mock global state
        let currentVideo = null;
        let streamStatus = 'stopped';

        // Status endpoint
        app.get('/api/status', async (req, res) => {
            try {
                const processStatus = processManager.getStatus();
                
                res.json({
                    stream_status: streamStatus,
                    current_video: currentVideo,
                    process_status: processStatus,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Videos endpoint
        app.get('/api/videos', async (req, res) => {
            try {
                const videosDir = path.join(__dirname, '../videos');
                const videos = [];
                
                if (await fs.pathExists(videosDir)) {
                    const files = await fs.readdir(videosDir);
                    
                    for (const file of files) {
                        if (file.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)$/)) {
                            videos.push({
                                filename: file,
                                size: 1024 * 1024,
                                modified: new Date().toISOString()
                            });
                        }
                    }
                }
                
                res.json({
                    videos: videos,
                    count: videos.length
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Switch video endpoint
        app.post('/api/switch', async (req, res) => {
            try {
                const { video } = req.body;
                if (!video) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'video parameter required' 
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

        // Stop stream endpoint
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

        // Health check endpoint
        app.get('/api/health', async (req, res) => {
            try {
                const processStatus = processManager.getStatus();

                res.json({
                    status: 'healthy',
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
    });

    describe('GET /api/status', () => {
        it('should return current status', async () => {
            processManager.getStatus.mockReturnValue({
                udp_streaming_running: false,
                udp_sender_pid: null
            });

            const response = await request(app).get('/api/status');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('stream_status', 'stopped');
            expect(response.body).toHaveProperty('current_video', null);
            expect(response.body).toHaveProperty('process_status');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /api/videos', () => {
        it('should return video list', async () => {
            fs.pathExists.mockResolvedValue(true);
            fs.readdir.mockResolvedValue(['video1.mp4', 'video2.mp4', 'not-a-video.txt']);

            const response = await request(app).get('/api/videos');

            expect(response.status).toBe(200);
            expect(response.body.videos).toHaveLength(2);
            expect(response.body.count).toBe(2);
            expect(response.body.videos[0]).toHaveProperty('filename', 'video1.mp4');
        });

        it('should return empty list when directory does not exist', async () => {
            fs.pathExists.mockResolvedValue(false);

            const response = await request(app).get('/api/videos');

            expect(response.status).toBe(200);
            expect(response.body.videos).toHaveLength(0);
            expect(response.body.count).toBe(0);
        });
    });

    describe('POST /api/switch', () => {
        it('should start UDP streaming with valid video', async () => {
            fs.pathExists.mockResolvedValue(true);
            processManager.startUdpStreaming.mockResolvedValue({
                success: true,
                message: 'UDP streaming started'
            });

            const response = await request(app)
                .post('/api/switch')
                .send({ video: 'test.mp4' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.video).toBe('test.mp4');
            expect(processManager.startUdpStreaming).toHaveBeenCalledWith('test.mp4');
        });

        it('should return 400 when video parameter is missing', async () => {
            const response = await request(app)
                .post('/api/switch')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('video parameter required');
        });

        it('should return 404 when video file does not exist', async () => {
            fs.pathExists.mockResolvedValue(false);

            const response = await request(app)
                .post('/api/switch')
                .send({ video: 'nonexistent.mp4' });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Video file not found');
        });
    });

    describe('POST /api/stop', () => {
        it('should stop UDP streaming', async () => {
            processManager.stopUdpStreaming.mockResolvedValue({
                success: true,
                message: 'UDP streaming stopped'
            });

            const response = await request(app).post('/api/stop');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Stream stopped successfully');
            expect(processManager.stopUdpStreaming).toHaveBeenCalled();
        });

        it('should handle stop error', async () => {
            processManager.stopUdpStreaming.mockResolvedValue({
                success: false,
                error: 'Process not found'
            });

            const response = await request(app).post('/api/stop');

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Process not found');
        });
    });

    describe('GET /api/health', () => {
        it('should return health status', async () => {
            processManager.getStatus.mockReturnValue({
                udp_streaming_running: true,
                udp_sender_pid: 12345
            });

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('healthy');
            expect(response.body.udp_process).toBe(true);
            expect(response.body).toHaveProperty('timestamp');
        });
    });
});