const path = require('path');
const fs = require('fs-extra');
const PlaylistManager = require('../playlistManager');
const { getCacheDir } = require('../fileUtils');

// テスト用のモックファイル作成
const createTestFile = async (filename, content = 'test') => {
  const testDir = path.join(getCacheDir(), 'test');
  await fs.ensureDir(testDir);
  const filePath = path.join(testDir, filename);
  await fs.writeFile(filePath, content);
  return filePath;
};

describe('PlaylistManager', () => {
  let playlistManager;
  let testFiles = [];

  beforeEach(async () => {
    playlistManager = new PlaylistManager('test-session');
    testFiles = [];
  });

  afterEach(async () => {
    // テストファイルのクリーンアップ
    for (const filePath of testFiles) {
      try {
        await fs.remove(filePath);
      } catch (error) {
        // ファイルが存在しない場合は無視
      }
    }

    // プレイリストのクリーンアップ
    if (playlistManager) {
      await playlistManager.cleanup();
    }
  });

  describe('プレイリスト作成', () => {
    test('単一ファイルでプレイリストを作成', async () => {
      const testFile = await createTestFile('test-video.mp4');
      testFiles.push(testFile);

      const playlistPath = await playlistManager.createPlaylist([testFile]);

      expect(await playlistManager.exists()).toBe(true);
      expect(playlistPath).toBe(playlistManager.getPlaylistPath());

      const content = await fs.readFile(playlistPath, 'utf8');
      expect(content).toContain(`file '${path.resolve(testFile).replace(/\\/g, '/')}'`);
    });

    test('複数ファイルでプレイリストを作成', async () => {
      const testFile1 = await createTestFile('test-video1.mp4');
      const testFile2 = await createTestFile('test-video2.mp4');
      testFiles.push(testFile1, testFile2);

      const playlistPath = await playlistManager.createPlaylist([testFile1, testFile2]);

      const content = await fs.readFile(playlistPath, 'utf8');
      expect(content).toContain(`file '${path.resolve(testFile1).replace(/\\/g, '/')}'`);
      expect(content).toContain(`file '${path.resolve(testFile2).replace(/\\/g, '/')}'`);

      const entries = playlistManager.getCurrentEntries();
      expect(entries).toEqual([testFile1, testFile2]);
    });

    test('存在しないファイルでエラーが発生', async () => {
      const nonExistentFile = path.join(getCacheDir(), 'non-existent.mp4');

      await expect(playlistManager.createPlaylist([nonExistentFile])).rejects.toThrow(
        'プレイリストのファイルが見つかりません'
      );
    });
  });

  describe('プレイリスト追加', () => {
    test('既存プレイリストにファイルを追加', async () => {
      const testFile1 = await createTestFile('test-video1.mp4');
      const testFile2 = await createTestFile('test-video2.mp4');
      testFiles.push(testFile1, testFile2);

      await playlistManager.createPlaylist([testFile1]);
      await playlistManager.appendToPlaylist(testFile2);

      const content = await fs.readFile(playlistManager.getPlaylistPath(), 'utf8');
      expect(content).toContain(`file '${path.resolve(testFile1).replace(/\\/g, '/')}'`);
      expect(content).toContain(`file '${path.resolve(testFile2).replace(/\\/g, '/')}'`);

      const entries = playlistManager.getCurrentEntries();
      expect(entries).toEqual([testFile1, testFile2]);
    });
  });

  describe('ループプレイリスト', () => {
    test('静止画用ループプレイリストを作成', async () => {
      const testImage = await createTestFile('test-image.jpg');
      testFiles.push(testImage);

      const playlistPath = await playlistManager.createLoopPlaylist(testImage);

      const content = await fs.readFile(playlistPath, 'utf8');
      expect(content).toContain(`file '${path.resolve(testImage).replace(/\\/g, '/')}'`);

      const entries = playlistManager.getCurrentEntries();
      expect(entries).toEqual([testImage]);
    });
  });

  describe('プレイリスト更新', () => {
    test('単一ファイルでプレイリストを更新', async () => {
      const testFile1 = await createTestFile('test-video1.mp4');
      const testFile2 = await createTestFile('test-video2.mp4');
      testFiles.push(testFile1, testFile2);

      await playlistManager.createPlaylist([testFile1]);
      await playlistManager.updatePlaylistSingle(testFile2);

      const content = await fs.readFile(playlistManager.getPlaylistPath(), 'utf8');
      expect(content).not.toContain(`file '${path.resolve(testFile1).replace(/\\/g, '/')}'`);
      expect(content).toContain(`file '${path.resolve(testFile2).replace(/\\/g, '/')}'`);

      const entries = playlistManager.getCurrentEntries();
      expect(entries).toEqual([testFile2]);
    });
  });

  describe('クリーンアップ', () => {
    test('プレイリストファイルを削除', async () => {
      const testFile = await createTestFile('test-video.mp4');
      testFiles.push(testFile);

      await playlistManager.createPlaylist([testFile]);
      expect(await playlistManager.exists()).toBe(true);

      await playlistManager.cleanup();
      expect(await playlistManager.exists()).toBe(false);
      expect(playlistManager.getCurrentEntries()).toEqual([]);
    });
  });
});
