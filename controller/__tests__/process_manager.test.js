const { spawn } = require('child_process');
const ProcessManager = require('../process_manager');
const EventEmitter = require('events');

// child_processのモック
jest.mock('child_process');

describe('ProcessManager', () => {
    let processManager;
    let mockProcess;

    beforeEach(() => {
        processManager = new ProcessManager();
        
        // プロセスのモックを作成
        mockProcess = new EventEmitter();
        mockProcess.kill = jest.fn();
        mockProcess.pid = 12345;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        
        spawn.mockReturnValue(mockProcess);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('startRtmpStream', () => {
        it('should start RTMP stream successfully', async () => {
            const result = await processManager.startRtmpStream();

            expect(result.success).toBe(true);
            expect(result.message).toBe('RTMP stream started');
            expect(spawn).toHaveBeenCalledWith('ffmpeg', [
                '-i', 'udp://127.0.0.1:1234?timeout=0',
                '-c', 'copy',
                '-f', 'flv',
                'rtmp://localhost:1936/live/stream'
            ]);
        });

        it('should not start if already running', async () => {
            await processManager.startRtmpStream();
            const result = await processManager.startRtmpStream();

            expect(result.success).toBe(false);
            expect(result.error).toBe('RTMP stream already running');
        });

        it('should handle spawn errors', async () => {
            spawn.mockImplementation(() => {
                throw new Error('Spawn error');
            });

            const result = await processManager.startRtmpStream();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Spawn error');
        });
    });

    describe('stopRtmpStream', () => {
        it('should stop RTMP stream successfully', async () => {
            await processManager.startRtmpStream();
            const result = await processManager.stopRtmpStream();

            expect(result.success).toBe(true);
            expect(result.message).toBe('RTMP stream stopped');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });

        it('should handle already stopped stream', async () => {
            const result = await processManager.stopRtmpStream();

            expect(result.success).toBe(true);
            expect(result.message).toBe('RTMP stream not running');
        });

        it('should force kill after timeout', async () => {
            await processManager.startRtmpStream();
            
            const stopPromise = processManager.stopRtmpStream();
            
            // タイムアウト後に強制終了される
            setTimeout(() => {
                processManager.rtmpProcess = null;
            }, 100);

            const result = await stopPromise;

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(result.success).toBe(true);
        });
    });

    describe('startUdpStreaming', () => {
        it('should start UDP streaming successfully', async () => {
            const result = await processManager.startUdpStreaming('test.mp4');

            expect(result.success).toBe(true);
            expect(result.message).toBe('UDP streaming started: test.mp4');
            expect(spawn).toHaveBeenCalledWith('ffmpeg', [
                '-re',
                '-i', expect.stringContaining('test.mp4'),
                '-c', 'copy',
                '-f', 'mpegts',
                'udp://127.0.0.1:1234'
            ]);
        });

        it('should stop existing stream before starting new one', async () => {
            await processManager.startUdpStreaming('first.mp4');
            
            // 最初のプロセスを保存
            const firstProcess = processManager.udpSenderProcess;
            
            // 新しいプロセスのために別のモックを作成
            const newMockProcess = new EventEmitter();
            newMockProcess.kill = jest.fn();
            newMockProcess.pid = 54321;
            newMockProcess.stdout = new EventEmitter();
            newMockProcess.stderr = new EventEmitter();
            
            spawn.mockReturnValueOnce(newMockProcess);
            
            const stopPromise = processManager.startUdpStreaming('second.mp4');
            
            // 最初のプロセスの停止をシミュレート
            setTimeout(() => {
                if (firstProcess === processManager.udpSenderProcess) {
                    processManager.udpSenderProcess = null;
                }
            }, 100);

            await stopPromise;

            expect(spawn).toHaveBeenCalledTimes(2);
        });
    });

    describe('stopUdpStreaming', () => {
        it('should stop UDP streaming successfully', async () => {
            await processManager.startUdpStreaming('test.mp4');
            const result = await processManager.stopUdpStreaming();

            expect(result.success).toBe(true);
            expect(result.message).toBe('UDP streaming stopped');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });
    });

    describe('getStatus', () => {
        it('should return correct status when processes are running', async () => {
            await processManager.startRtmpStream();
            await processManager.startUdpStreaming('test.mp4');
            
            const status = processManager.getStatus();

            expect(status.rtmp_stream_running).toBe(true);
            expect(status.udp_streaming_running).toBe(true);
            expect(status.rtmp_pid).toBe(12345);
            expect(status.udp_sender_pid).toBe(12345);
        });

        it('should return correct status when processes are not running', () => {
            const status = processManager.getStatus();

            expect(status.rtmp_stream_running).toBe(false);
            expect(status.udp_streaming_running).toBe(false);
            expect(status.rtmp_pid).toBe(null);
            expect(status.udp_sender_pid).toBe(null);
        });
    });

    describe('stopAll', () => {
        it('should stop all processes', async () => {
            await processManager.startRtmpStream();
            await processManager.startUdpStreaming('test.mp4');
            
            const stopPromise = processManager.stopAll();
            
            // プロセス停止をシミュレート
            setTimeout(() => {
                processManager.rtmpProcess = null;
                processManager.udpSenderProcess = null;
            }, 100);

            const result = await stopPromise;

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(3); // Now includes relay stop
        });
    });

    describe('process events', () => {
        it('should handle process close event', async () => {
            await processManager.startRtmpStream();
            
            mockProcess.emit('close', 0);
            
            // イベントループが処理されるまで少し待つ
            await new Promise(resolve => setImmediate(resolve));

            expect(processManager.rtmpProcess).toBe(null);
        });

        it('should handle process error event', async () => {
            await processManager.startRtmpStream();
            
            // エラーハンドリングを設定
            const originalError = console.error;
            console.error = jest.fn();
            
            mockProcess.emit('error', new Error('Process error'));
            
            // イベントループが処理されるまで少し待つ
            await new Promise(resolve => setImmediate(resolve));

            expect(processManager.rtmpProcess).toBe(null);
            
            // console.errorを元に戻す
            console.error = originalError;
        });
    });
});