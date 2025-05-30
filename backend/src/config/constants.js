module.exports = {
  FILE_LIMITS: {
    MAX_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
    ALLOWED_TYPES: [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-flv',
      'video/webm',
    ],
  },

  STREAM_DEFAULTS: {
    VIDEO_CODEC: 'libx264',
    AUDIO_CODEC: 'aac',
    VIDEO_BITRATE: '2000k',
    AUDIO_BITRATE: '128k',
    PRESET: 'medium',
    FORMAT: 'flv',
  },

  PATHS: {
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    DATA_DIR: process.env.DATA_DIR || './data',
    TEMP_DIR: process.env.TEMP_DIR || './temp',
  },

  FFMPEG: {
    TIMEOUT: 60000, // 1 minute
    NICE_LEVEL: 10,
    THREAD_COUNT: 0, // 0 = auto
  },

  ERROR_MESSAGES: {
    FILE_NOT_FOUND: 'File not found',
    INVALID_FILE_TYPE: 'Invalid file type',
    STREAM_START_FAILED: 'Failed to start stream',
    STREAM_NOT_FOUND: 'Stream not found',
    INVALID_URL: 'Invalid URL provided',
    GOOGLE_DRIVE_ERROR: 'Google Drive access error',
  },
};
