const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const fileService = require('../services/fileService');

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
  }
});

const upload = multer({ 
  storage: storage,
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
  }
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
      uploadedAt: new Date()
    };
    
    const savedFile = await fileService.saveFileInfo(fileData);
    res.status(201).json(savedFile);
  } catch (error) {
    next(error);
  }
});

// ファイル情報の取得
router.get('/:fileId', async (req, res, next) => {
  try {
    const fileId = req.params.fileId;
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
    const fileId = req.params.fileId;
    await fileService.deleteFile(fileId);
    res.status(200).json({ message: 'ファイルが正常に削除されました' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;