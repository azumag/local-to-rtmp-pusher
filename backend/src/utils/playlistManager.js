const path = require('path');
const fs = require('fs-extra');
const { getCacheDir, fileExists } = require('./fileUtils');

/**
 * プレイリスト管理クラス
 * FFmpeg concat demuxerで使用するプレイリストファイルを管理
 */
class PlaylistManager {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.playlistPath = path.join(getCacheDir('playlists'), `${sessionId}.txt`);
    this.currentEntries = [];
  }

  /**
   * プレイリストディレクトリの初期化
   */
  async initialize() {
    const playlistDir = path.dirname(this.playlistPath);
    await fs.ensureDir(playlistDir);
  }

  /**
   * プレイリストファイルの作成
   * @param {string[]} filePaths - ファイルパスの配列
   */
  async createPlaylist(filePaths) {
    await this.initialize();
    
    // ファイルの存在確認
    for (const filePath of filePaths) {
      if (!(await fileExists(filePath))) {
        throw new Error(`プレイリストのファイルが見つかりません: ${filePath}`);
      }
    }

    // プレイリスト形式で書き込み
    const playlistContent = filePaths
      .map(filePath => {
        // 絶対パスを使用してWindows互換性を確保
        const absolutePath = path.resolve(filePath);
        return `file '${absolutePath.replace(/\\/g, '/')}'`;
      })
      .join('\n');

    await fs.writeFile(this.playlistPath, playlistContent, 'utf8');
    this.currentEntries = [...filePaths];
    
    console.log(`Playlist created: ${this.playlistPath}`);
    console.log(`Content:\n${playlistContent}`);
    
    return this.playlistPath;
  }

  /**
   * プレイリストにファイルを追加
   * @param {string} filePath - 追加するファイルパス
   */
  async appendToPlaylist(filePath) {
    if (!(await fileExists(filePath))) {
      throw new Error(`追加するファイルが見つかりません: ${filePath}`);
    }

    const absolutePath = path.resolve(filePath);
    const newEntry = `file '${absolutePath.replace(/\\/g, '/')}'`;
    
    // プレイリストファイルに追記
    await fs.appendFile(this.playlistPath, '\n' + newEntry, 'utf8');
    this.currentEntries.push(filePath);
    
    console.log(`Added to playlist: ${filePath}`);
    return this.playlistPath;
  }

  /**
   * プレイリストを単一ファイルで更新（ループ再生用）
   * @param {string} filePath - 新しいファイルパス
   */
  async updatePlaylistSingle(filePath) {
    return await this.createPlaylist([filePath]);
  }

  /**
   * プレイリストの取得
   */
  getPlaylistPath() {
    return this.playlistPath;
  }

  /**
   * 現在のプレイリスト内容を取得
   */
  getCurrentEntries() {
    return [...this.currentEntries];
  }

  /**
   * プレイリストファイルの存在確認
   */
  async exists() {
    return await fileExists(this.playlistPath);
  }

  /**
   * プレイリストファイルの削除
   */
  async cleanup() {
    try {
      if (await this.exists()) {
        await fs.remove(this.playlistPath);
        console.log(`Playlist cleaned up: ${this.playlistPath}`);
      }
      this.currentEntries = [];
    } catch (error) {
      console.warn(`Failed to cleanup playlist: ${error.message}`);
    }
  }

  /**
   * ループ再生プレイリストの作成（静止画用）
   * @param {string} imagePath - 静止画ファイルパス
   * @param {number} duration - 表示時間（秒）
   */
  async createLoopPlaylist(imagePath, duration = 3600) {
    await this.initialize();
    
    if (!(await fileExists(imagePath))) {
      throw new Error(`静止画ファイルが見つかりません: ${imagePath}`);
    }

    const absolutePath = path.resolve(imagePath);
    // 静止画をループ再生する設定
    const playlistContent = `file '${absolutePath.replace(/\\/g, '/')}'`;
    
    await fs.writeFile(this.playlistPath, playlistContent, 'utf8');
    this.currentEntries = [imagePath];
    
    console.log(`Loop playlist created: ${this.playlistPath} for ${imagePath}`);
    return this.playlistPath;
  }
}

module.exports = PlaylistManager;