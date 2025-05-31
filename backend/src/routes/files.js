const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const fileService = require('../services/fileService');
const ffmpegService = require('../services/ffmpegService');

// ローカルファイルのアップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // getCacheDir関数を使用して一貫性のあるディレクトリ作成を行う
    const { getCacheDir } = require('../utils/fileUtils');
    const uploadDir = path.join(getCacheDir('uploads'));
    fs.ensureDirSync(uploadDir);
    console.log(`Upload directory: ${uploadDir}`); // デバッグ用ログ
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // オリジナルのファイル名を保持しつつ、タイムスタンプを追加
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB上限
  fileFilter: (req, file, cb) => {
    // 動画ファイルの種類をチェック
    const filetypes = /mp4|mov|avi|mkv|webm|flv|wmv|mpg|mpeg/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('サポートされていないファイル形式です。動画ファイルをアップロードしてください。'));
  },
});

// ファイル一覧の取得
router.get('/', async (req, res, next) => {
  try {
    let files = await fileService.listFiles();
    // 常に配列を返すことを保証
    if (!Array.isArray(files)) {
      files = [];
      console.error('ファイルリストが配列ではありません:', files);
    }
    res.status(200).json(files);
  } catch (error) {
    console.error('ファイル一覧取得エラー:', error);
    // エラー時も空配列を返す
    res.status(200).json([]);
  }
});

// ファイルのアップロード
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }

    const fileData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date(),
    };

    const savedFile = await fileService.saveFileInfo(fileData);

    // バックグラウンドでサムネイル生成（エラーがあっても処理は続行）
    try {
      await ffmpegService.generateThumbnail(savedFile.path, savedFile.id);
    } catch (thumbnailError) {
      console.warn(
        `サムネイル生成に失敗しました (ファイル: ${savedFile.id}):`,
        thumbnailError.message
      );
    }

    res.status(201).json(savedFile);
  } catch (error) {
    next(error);
  }
});

// ファイル情報の取得
router.get('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const fileInfo = await fileService.getFileInfo(fileId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    res.status(200).json(fileInfo);
  } catch (error) {
    next(error);
  }
});

// ファイルの削除
router.delete('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    await fileService.deleteFile(fileId);
    res.status(200).json({ message: 'ファイルが正常に削除されました' });
  } catch (error) {
    next(error);
  }
});

// サムネイル取得
router.get('/:fileId/thumbnail', async (req, res, next) => {
  try {
    const { fileId } = req.params;

    // ファイル情報を取得してファイルが存在するか確認
    const fileInfo = await fileService.getFileById(fileId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    // サムネイルパスを取得
    let thumbnailPath = ffmpegService.getThumbnailPath(fileId);

    // サムネイルが存在しない場合は生成を試みる
    if (!thumbnailPath) {
      try {
        thumbnailPath = await ffmpegService.generateThumbnail(fileInfo.path, fileId);
      } catch (thumbnailError) {
        console.warn(`サムネイル生成に失敗しました:`, thumbnailError.message);
        return res.status(404).json({ error: 'サムネイルを生成できませんでした' });
      }
    }

    // サムネイル画像を返す
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400'); // 24時間キャッシュ
      res.sendFile(path.resolve(thumbnailPath));
    } else {
      res.status(404).json({ error: 'サムネイルが見つかりません' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
