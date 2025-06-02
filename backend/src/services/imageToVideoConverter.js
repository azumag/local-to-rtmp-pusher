const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { getCacheDir, fileExists } = require('../utils/fileUtils');
const logger = require('../utils/logger');

/**
 * 静止画を短いループ動画に変換
 * @param {string} imagePath - 静止画のパス
 * @param {string} sessionId - セッションID
 * @returns {Promise<string>} 変換された動画のパス
 */
async function convertImageToLoopVideo(imagePath, sessionId) {
  const videoPath = path.join(getCacheDir(), `session-${sessionId}-loop.mp4`);

  // 既存のファイルがあれば削除
  if (await fileExists(videoPath)) {
    await fs.unlink(videoPath);
  }

  return new Promise((resolve, reject) => {
    // 静止画を入力として設定
    const command = ffmpeg(imagePath).inputOptions([
      '-loop',
      '1', // 画像をループ
      '-framerate',
      '1', // 入力フレームレート
      '-t',
      '5', // 5秒の動画を作成
    ]);

    // 無音のオーディオトラックを追加
    command
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputOptions(['-f', 'lavfi', '-t', '5'])
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt',
        'yuv420p', // 互換性のあるピクセルフォーマット
        '-r',
        '30', // 出力フレームレート30fps
        '-preset',
        'ultrafast', // 高速エンコード
        '-crf',
        '23', // 品質設定
        '-shortest', // 最短の入力ストリームの長さに合わせる
      ])
      .output(videoPath)
      .on('start', (commandLine) => {
        logger.info(`Starting image to video conversion: ${commandLine}`);
      })
      .on('end', () => {
        logger.info(`Converted static image to loop video: ${videoPath}`);
        resolve(videoPath);
      })
      .on('error', (err) => {
        logger.error(`Error converting image to video: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

module.exports = {
  convertImageToLoopVideo,
};
