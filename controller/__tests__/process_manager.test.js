const ProcessManager = require('../process_manager');
const { spawn } = require('child_process');

// Mock child_process.spawn
jest.mock('child_process', () => ({
    spawn: jest.fn()
}));

// Enable fake timers
beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('ProcessManager', () => {
    let processManager;
    let mockProcess;

    beforeEach(() => {
        processManager = new ProcessManager();
        
        // Reset mocks
        spawn.mockClear();
        
        // Create mock process with event emitter functionality
        mockProcess = {
            pid: 12345,
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn(),
            kill: jest.fn(),
            _events: new Map()
        };
        
        // Mock the event registration to track callbacks
        mockProcess.on.mockImplementation((event, callback) => {
            if (!mockProcess._events.has(event)) {
                mockProcess._events.set(event, []);
            }
            mockProcess._events.get(event).push(callback);
        });
        
        // Helper to trigger events
        mockProcess._trigger = (event, ...args) => {
            const callbacks = mockProcess._events.get(event) || [];
            callbacks.forEach(callback => callback(...args));
        };
        
        spawn.mockReturnValue(mockProcess);
    });

    describe('startUdpStreaming', () => {
        it('should start UDP streaming successfully', async () => {
            const result = await processManager.startUdpStreaming('test.mp4');

            expect(result.success).toBe(true);
            expect(result.message).toBe('UDP streaming started: test.mp4');
            expect(spawn).toHaveBeenCalledWith('ffmpeg', [
                '-re',
                '-stream_loop', '-1',
                '-i', expect.stringContaining('test.mp4'),
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                '-c', 'copy',
                '-f', 'mpegts',
                '-buffer_size', '65536',
                'udp://receiver:1234'
            ]);
        });

        it('should stop existing stream before starting new one', async () => {
            await processManager.startUdpStreaming('first.mp4');
            
            // Start the second streaming (which will stop the first one)
            const startPromise = processManager.startUdpStreaming('second.mp4');
            
            // Simulate the first process closing when killed
            mockProcess._trigger('close', 0);
            
            const result = await startPromise;

            expect(result.success).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });
    });

    describe('stopUdpStreaming', () => {
        it('should stop UDP streaming successfully', async () => {
            await processManager.startUdpStreaming('test.mp4');
            
            // Start the stop operation
            const stopPromise = processManager.stopUdpStreaming();
            
            // Trigger the close event
            mockProcess._trigger('close', 0);
            
            const result = await stopPromise;

            expect(result.success).toBe(true);
            expect(result.message).toBe('UDP streaming stopped');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });

        it('should handle already stopped stream', async () => {
            const result = await processManager.stopUdpStreaming();

            expect(result.success).toBe(true);
            expect(result.message).toBe('UDP streaming not running');
        });

        it('should force kill after timeout', async () => {
            await processManager.startUdpStreaming('test.mp4');
            
            const stopPromise = processManager.stopUdpStreaming();
            
            // Advance timers to trigger the timeout (5000ms)
            jest.advanceTimersByTime(5000);
            
            const result = await stopPromise;

            expect(result.success).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
        });
    });

    describe('getStatus', () => {
        it('should return correct status when process is running', async () => {
            await processManager.startUdpStreaming('test.mp4');
            
            const status = processManager.getStatus();

            expect(status.udp_streaming_running).toBe(true);
            expect(status.udp_sender_pid).toBe(12345);
        });

        it('should return correct status when process is not running', () => {
            const status = processManager.getStatus();

            expect(status.udp_streaming_running).toBe(false);
            expect(status.udp_sender_pid).toBe(null);
        });
    });

    describe('stopAll', () => {
        it('should stop all processes (UDP only)', async () => {
            await processManager.startUdpStreaming('test.mp4');
            
            // Start the stop operation
            const stopPromise = processManager.stopAll();
            
            // Trigger the close event
            mockProcess._trigger('close', 0);
            
            const result = await stopPromise;

            expect(result.success).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });
    });

    describe('process events', () => {
        it('should handle process close event', async () => {
            await processManager.startUdpStreaming('test.mp4');

            // Simulate process close
            mockProcess._trigger('close', 0);

            expect(processManager.udpSenderProcess).toBe(null);
        });

        it('should handle process error event', async () => {
            await processManager.startUdpStreaming('test.mp4');

            // Simulate process error
            mockProcess._trigger('error', new Error('Process error'));

            expect(processManager.udpSenderProcess).toBe(null);
        });
    });
});