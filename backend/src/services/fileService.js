const fs = require('fs-extra');
const path = require('path');
const { getCacheDir, fileExists, getFileType, generateUniqueId } = require('../utils/fileUtils');

// ファイル情報の保存先
const FILE_DB_PATH = path.join(getCacheDir(), 'files.json');

// ファイルDBの初期化
const initializeFileDb = async () => {
  if (!await fileExists(FILE_DB_PATH)) {
    await fs.writeJSON(FILE_DB_PATH, { files: [] });
  }
  return await fs.readJSON(FILE_DB_PATH);
};

/**
 * ファイル一覧の取得
 * @returns {Promise<Array>} ファイル一覧
 */
const listFiles = async () => {
  try {
    const db = await initializeFileDb();
    return db.files;
  } catch (error) {
    console.error(`Error listing files: ${error.message}`);
    throw new Error('ファイル一覧の取得に失敗しました');
  }
};

/**
 * ファイル情報の保存
 * @param {Object} fileData - ファイル情報
 * @returns {Promise<Object>} 保存されたファイル情報
 */
const saveFileInfo = async (fileData) => {
  try {
    const db = await initializeFileDb();
    
    const fileId = generateUniqueId();
    const newFile = {
      id: fileId,
      ...fileData,
      type: getFileType(fileData.path || fileData.originalName),
      createdAt: new Date().toISOString()
    };
    
    db.files.push(newFile);
    await fs.writeJSON(FILE_DB_PATH, db);
    
    return newFile;
  } catch (error) {
    console.error(`Error saving file info: ${error.message}`);
    throw new Error('ファイル情報の保存に失敗しました');
  }
};

/**
 * ファイル情報の取得
 * @param {string} fileId - ファイルID
 * @returns {Promise<Object|null>} ファイル情報
 */
const getFileInfo = async (fileId) => {
  try {
    const db = await initializeFileDb();
    const file = db.files.find(f => f.id === fileId);
    
    if (!file) {
      return null;
    }
    
    // ファイルが存在するか確認
    if (file.path && !await fileExists(file.path)) {
      file.status = 'missing';
    } else {
      file.status = 'available';
    }
    
    return file;
  } catch (error) {
    console.error(`Error getting file info: ${error.message}`);
    throw new Error('ファイル情報の取得に失敗しました');
  }
};

/**
 * ファイルの削除
 * @param {string} fileId - ファイルID
 * @returns {Promise<boolean>} 削除が成功したかどうか
 */
const deleteFile = async (fileId) => {
  try {
    const db = await initializeFileDb();
    const fileIndex = db.files.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return false;
    }
    
    const file = db.files[fileIndex];
    
    // ディスク上のファイルを削除
    if (file.path && await fileExists(file.path)) {
      await fs.remove(file.path);
    }
    
    // DBからファイル情報を削除
    db.files.splice(fileIndex, 1);
    await fs.writeJSON(FILE_DB_PATH, db);
    
    return true;
  } catch (error) {
    console.error(`Error deleting file: ${error.message}`);
    throw new Error('ファイルの削除に失敗しました');
  }
};

/**
 * ファイルパスからファイル情報を検索
 * @param {string} filePath - ファイルパス
 * @returns {Promise<Object|null>} ファイル情報
 */
const findFileByPath = async (filePath) => {
  try {
    const db = await initializeFileDb();
    return db.files.find(f => f.path === filePath) || null;
  } catch (error) {
    console.error(`Error finding file by path: ${error.message}`);
    return null;
  }
};

module.exports = {
  listFiles,
  saveFileInfo,
  getFileInfo,
  deleteFile,
  findFileByPath
};