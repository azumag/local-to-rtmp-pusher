const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getCacheDir } = require('../utils/fileUtils');

// ファイル情報の保存先（JSONファイルを使用）
const FILES_DB_PATH = path.join(getCacheDir(), 'files.json');

// ファイルDBの初期化
const initFilesDb = () => {
  if (!fs.existsSync(FILES_DB_PATH)) {
    fs.writeJsonSync(FILES_DB_PATH, []);
  }
};

// ファイル一覧の取得
const getFiles = async () => {
  initFilesDb();
  try {
    const files = fs.readJsonSync(FILES_DB_PATH);
    // 配列であることを確認
    if (!Array.isArray(files)) {
      console.error('ファイルデータが配列ではありません。配列に初期化します。');
      // 配列でない場合は空の配列に初期化して保存
      fs.writeJsonSync(FILES_DB_PATH, []);
      return [];
    }
    return files;
  } catch (error) {
    console.error('ファイルの読み込みエラー:', error);
    // エラーの場合も空の配列を返す
    return [];
  }
};

// ファイル一覧の取得（getFilesのエイリアス）
const listFiles = async () => {
  return getFiles();
};

// ファイル情報の保存
const saveFileInfo = async (fileData) => {
  initFilesDb();
  let files = await getFiles();
  
  // 配列でない場合は空の配列にする
  if (!Array.isArray(files)) {
    files = [];
  }
  
  const newFile = {
    id: uuidv4(),
    ...fileData,
    createdAt: new Date().toISOString()
  };
  
  files.push(newFile);
  
  // ファイル保存時にエラーハンドリングを追加
  try {
    fs.writeJsonSync(FILES_DB_PATH, files);
    console.log(`ファイル情報を保存しました: ${newFile.id}`);
  } catch (error) {
    console.error('ファイル情報の保存に失敗しました:', error);
    throw new Error('ファイル情報の保存に失敗しました');
  }
  
  return newFile;
};

// IDによるファイル情報の取得
const getFileById = async (fileId) => {
  const files = await getFiles();
  return files.find(file => file.id === fileId);
};

// ファイルの削除
const deleteFile = async (fileId) => {
  const files = await getFiles();
  const fileToDelete = files.find(file => file.id === fileId);
  
  if (!fileToDelete) {
    throw new Error('ファイルが見つかりません');
  }
  
  // ファイルシステムからも削除
  if (fileToDelete.path && fs.existsSync(fileToDelete.path)) {
    fs.removeSync(fileToDelete.path);
  }
  
  // DBからファイル情報を削除
  const updatedFiles = files.filter(file => file.id !== fileId);
  fs.writeJsonSync(FILES_DB_PATH, updatedFiles);
  
  return { success: true };
};

// ファイルステータスの更新
const updateFileStatus = async (fileId, status, additionalInfo = {}) => {
  const files = await getFiles();
  const fileIndex = files.findIndex(file => file.id === fileId);
  
  if (fileIndex === -1) {
    throw new Error('ファイルが見つかりません');
  }
  
  files[fileIndex] = {
    ...files[fileIndex],
    status,
    ...additionalInfo,
    updatedAt: new Date().toISOString()
  };
  
  try {
    fs.writeJsonSync(FILES_DB_PATH, files);
    return files[fileIndex];
  } catch (error) {
    console.error('ファイル状態の更新に失敗しました:', error);
    throw new Error('ファイル状態の更新に失敗しました');
  }
};

module.exports = {
  getFiles,
  listFiles,
  saveFileInfo,
  getFileById,
  deleteFile,
  updateFileStatus // 新しい関数をエクスポート
};