const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const fileService = require('../services/fileService');

// ローカルファイルのアップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../cache/uploads');
    fs.ensureDirSync(uploadDir);
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
    const files = await fileService.listFiles();
    res.status(200).json(files);
  } catch (error) {
    next(error);
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