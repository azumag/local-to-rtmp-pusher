const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const ffmpegService = require('../ffmpegService');

// Mock fluent-ffmpeg
jest.mock('fluent-ffmpeg');
jest.mock('child_process');

describe('FFmpegService', () => {
  let mockCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock command object
    mockCommand = {
      outputOptions: jest.fn().mockReturnThis(),
      videoCodec: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      videoBitrate: jest.fn().mockReturnThis(),
      audioBitrate: jest.fn().mockReturnThis(),
      size: jest.fn().mockReturnThis(),
      format: jest.fn().mockReturnThis(),
      output: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      run: jest.fn(),
      kill: jest.fn(),
    };

    ffmpeg.mockReturnValue(mockCommand);

    // Clear active processes
    ffmpegService.activeProcesses.clear();
  });

  describe('buildFFmpegCommand', () => {
    it('should build command with default settings', () => {
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';

      ffmpegService.buildFFmpegCommand(input, outputUrl);

      expect(ffmpeg).toHaveBeenCalledWith(input);
      expect(mockCommand.outputOptions).toHaveBeenCalled();
      expect(mockCommand.videoCodec).toHaveBeenCalledWith('libx264');
      expect(mockCommand.audioCodec).toHaveBeenCalledWith('aac');
      expect(mockCommand.videoBitrate).toHaveBeenCalledWith('2000k');
      expect(mockCommand.audioBitrate).toHaveBeenCalledWith('128k');
      expect(mockCommand.format).toHaveBeenCalledWith('flv');
      expect(mockCommand.output).toHaveBeenCalledWith(outputUrl);
    });

    it('should handle copy codecs', () => {
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';
      const settings = {
        videoCodec: 'copy',
        audioCodec: 'copy',
      };

      ffmpegService.buildFFmpegCommand(input, outputUrl, settings);

      expect(mockCommand.videoCodec).toHaveBeenCalledWith('copy');
      expect(mockCommand.audioCodec).toHaveBeenCalledWith('copy');
      expect(mockCommand.videoBitrate).not.toHaveBeenCalled();
      expect(mockCommand.audioBitrate).not.toHaveBeenCalled();
    });

    it('should apply custom resolution', () => {
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';
      const settings = {
        resolution: '1280x720',
      };

      ffmpegService.buildFFmpegCommand(input, outputUrl, settings);

      expect(mockCommand.size).toHaveBeenCalledWith('1280x720');
    });
  });

  describe('startStream', () => {
    it('should start stream successfully', async () => {
      const streamId = 'test-stream-1';
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';

      const result = await ffmpegService.startStream(streamId, input, outputUrl);

      expect(result).toMatchObject({
        streamId,
        status: 'started',
      });
      expect(result.startTime).toBeInstanceOf(Date);
      expect(mockCommand.run).toHaveBeenCalled();
      expect(ffmpegService.activeProcesses.has(streamId)).toBe(true);
    });

    it('should handle stream start error', async () => {
      const streamId = 'test-stream-2';
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';

      // Clear any existing processes
      ffmpegService.activeProcesses.clear();

      // Mock run to throw an error
      mockCommand.run.mockImplementation(() => {
        throw new Error('FFmpeg error');
      });

      await expect(ffmpegService.startStream(streamId, input, outputUrl)).rejects.toThrow(
        'FFmpeg error'
      );

      expect(ffmpegService.activeProcesses.has(streamId)).toBe(false);
    });
  });

  describe('stopStream', () => {
    it('should stop active stream', async () => {
      const streamId = 'test-stream-3';
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';

      // Start stream first
      await ffmpegService.startStream(streamId, input, outputUrl);

      const result = ffmpegService.stopStream(streamId);

      expect(result).toBe(true);
      expect(mockCommand.kill).toHaveBeenCalledWith('SIGTERM');
      expect(ffmpegService.activeProcesses.has(streamId)).toBe(false);
    });

    it('should return false for non-existent stream', () => {
      const result = ffmpegService.stopStream('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getStreamStatus', () => {
    it('should return status for active stream', async () => {
      const streamId = 'test-stream-4';
      const input = 'input.mp4';
      const outputUrl = 'rtmp://localhost/live/stream';
      const settings = { videoCodec: 'libx264' };

      await ffmpegService.startStream(streamId, input, outputUrl, settings);

      const status = ffmpegService.getStreamStatus(streamId);

      expect(status).toMatchObject({
        streamId,
        status: 'active',
        input,
        outputUrl,
        settings,
      });
      expect(status.startTime).toBeInstanceOf(Date);
    });

    it('should return null for non-existent stream', () => {
      const status = ffmpegService.getStreamStatus('non-existent');
      expect(status).toBeNull();
    });
  });

  describe('getAllStreams', () => {
    it('should return all active streams', async () => {
      const stream1 = {
        id: 'stream-1',
        input: 'input1.mp4',
        outputUrl: 'rtmp://localhost/live/stream1',
      };
      const stream2 = {
        id: 'stream-2',
        input: 'input2.mp4',
        outputUrl: 'rtmp://localhost/live/stream2',
      };

      await ffmpegService.startStream(stream1.id, stream1.input, stream1.outputUrl);
      await ffmpegService.startStream(stream2.id, stream2.input, stream2.outputUrl);

      const streams = ffmpegService.getAllStreams();

      expect(streams).toHaveLength(2);
      expect(streams[0]).toMatchObject({
        streamId: stream1.id,
        status: 'active',
        outputUrl: stream1.outputUrl,
      });
      expect(streams[1]).toMatchObject({
        streamId: stream2.id,
        status: 'active',
        outputUrl: stream2.outputUrl,
      });
    });

    it('should return empty array when no active streams', () => {
      const streams = ffmpegService.getAllStreams();
      expect(streams).toEqual([]);
    });
  });

  describe('validateFFmpegInstallation', () => {
    it('should resolve when FFmpeg is installed', async () => {
      const mockProcess = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const promise = ffmpegService.validateFFmpegInstallation();

      mockProcess.emit('close', 0);

      await expect(promise).resolves.toBe(true);
      expect(spawn).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    it('should reject when FFmpeg is not installed', async () => {
      const mockProcess = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const promise = ffmpegService.validateFFmpegInstallation();

      mockProcess.emit('error', new Error('Command not found'));

      await expect(promise).rejects.toThrow('FFmpeg is not installed');
    });

    it('should reject when FFmpeg check fails', async () => {
      const mockProcess = new EventEmitter();
      spawn.mockReturnValue(mockProcess);

      const promise = ffmpegService.validateFFmpegInstallation();

      mockProcess.emit('close', 1);

      await expect(promise).rejects.toThrow('FFmpeg installation check failed');
    });
  });
});
