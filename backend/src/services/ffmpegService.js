const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { STREAM_DEFAULTS, FFMPEG } = require('../config/constants');

class FFmpegService {
  constructor() {
    this.activeProcesses = new Map();
  }

  buildFFmpegCommand(input, outputUrl, settings = {}) {
    const {
      videoCodec = STREAM_DEFAULTS.VIDEO_CODEC,
      audioCodec = STREAM_DEFAULTS.AUDIO_CODEC,
      videoBitrate = STREAM_DEFAULTS.VIDEO_BITRATE,
      audioBitrate = STREAM_DEFAULTS.AUDIO_BITRATE,
      resolution,
      preset = STREAM_DEFAULTS.PRESET,
      format = STREAM_DEFAULTS.FORMAT,
    } = settings;

    const command = ffmpeg(input)
      .outputOptions([
        '-threads',
        FFMPEG.THREAD_COUNT,
        '-preset',
        preset,
        '-tune',
        'zerolatency',
        '-max_muxing_queue_size',
        '1024',
        '-flvflags',
        'no_duration_filesize',
      ])
      .on('start', (commandLine) => {
        logger.info('FFmpeg command started:', commandLine);
      })
      .on('progress', (progress) => {
        logger.debug('Processing:', progress);
      })
      .on('error', (err) => {
        logger.error('FFmpeg error:', err);
      })
      .on('end', () => {
        logger.info('FFmpeg process finished');
      });

    // Video settings
    if (videoCodec === 'copy') {
      command.videoCodec('copy');
    } else {
      command.videoCodec(videoCodec);
      if (videoBitrate) {
        command.videoBitrate(videoBitrate);
      }
      if (resolution && resolution !== 'original') {
        command.size(resolution);
      }
    }

    // Audio settings
    if (audioCodec === 'copy') {
      command.audioCodec('copy');
    } else {
      command.audioCodec(audioCodec);
      if (audioBitrate) {
        command.audioBitrate(audioBitrate);
      }
    }

    command.format(format);
    command.output(outputUrl);

    return command;
  }

  startStream(streamId, input, outputUrl, settings = {}) {
    return new Promise((resolve, reject) => {
      try {
        const command = this.buildFFmpegCommand(input, outputUrl, settings);

        this.activeProcesses.set(streamId, {
          command,
          startTime: new Date(),
          input,
          outputUrl,
          settings,
        });

        command.on('error', (err) => {
          this.activeProcesses.delete(streamId);
          reject(err);
        });

        command.on('end', () => {
          this.activeProcesses.delete(streamId);
        });

        command.run();

        resolve({
          streamId,
          status: 'started',
          startTime: new Date(),
        });
      } catch (error) {
        this.activeProcesses.delete(streamId);
        reject(error);
      }
    });
  }

  stopStream(streamId) {
    const process = this.activeProcesses.get(streamId);
    if (!process) {
      return false;
    }

    try {
      process.command.kill('SIGTERM');
      this.activeProcesses.delete(streamId);
      return true;
    } catch (error) {
      logger.error(`Error stopping stream ${streamId}:`, error);
      return false;
    }
  }

  getStreamStatus(streamId) {
    const process = this.activeProcesses.get(streamId);
    if (!process) {
      return null;
    }

    return {
      streamId,
      status: 'active',
      startTime: process.startTime,
      input: process.input,
      outputUrl: process.outputUrl,
      settings: process.settings,
    };
  }

  getAllStreams() {
    const streams = [];
    for (const [streamId, process] of this.activeProcesses) {
      streams.push({
        streamId,
        status: 'active',
        startTime: process.startTime,
        outputUrl: process.outputUrl,
      });
    }
    return streams;
  }

  async validateFFmpegInstallation() {
    return new Promise((resolve, reject) => {
      const ffmpegCheck = spawn('ffmpeg', ['-version']);

      ffmpegCheck.on('error', () => {
        reject(new Error('FFmpeg is not installed'));
      });

      ffmpegCheck.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error('FFmpeg installation check failed'));
        }
      });
    });
  }
}

module.exports = new FFmpegService();
