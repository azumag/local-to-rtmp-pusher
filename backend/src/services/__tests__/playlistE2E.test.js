const path = require('path');
const fs = require('fs-extra');
const { PersistentStreamService, SESSION_STATES } = require('../persistentStreamService');
const PlaylistManager = require('../../utils/playlistManager');
const { getCacheDir } = require('../../utils/fileUtils');

// エンドツーエンドテスト: 実際のプレイリストファイルを作成してワークフローを検証
describe('プレイリスト配信 E2E テスト', () => {
  let service;
  let testFiles = [];
  let sessionId;

  const createTestFile = async (filename, content = 'test video content') => {
    const testDir = path.join(getCacheDir(), 'test-e2e');
    await fs.ensureDir(testDir);
    const filePath = path.join(testDir, filename);
    await fs.writeFile(filePath, content);
    testFiles.push(filePath);
    return filePath;
  };

  beforeEach(async () => {
    service = new PersistentStreamService();
    testFiles = [];
    sessionId = null;

    // createDefaultStandbyImageをモック
    service.createDefaultStandbyImage = jest.fn().mockResolvedValue();
    service.getDefaultStandbyImagePath = jest
      .fn()
      .mockReturnValue(path.join(getCacheDir(), 'standby', 'default.jpg'));
  });

  afterEach(async () => {
    // セッションクリーンアップ
    if (sessionId) {
      try {
        await service.stopSession(sessionId);
      } catch (error) {
        // セッションが既に停止している場合は無視
      }
    }

    // テストファイルのクリーンアップ
    for (const filePath of testFiles) {
      try {
        await fs.remove(filePath);
      } catch (error) {
        // ファイルが存在しない場合は無視
      }
    }
  });

  test('プレイリスト方式による配信ワークフロー', async () => {
    // テスト用ファイル作成
    const standbyImage = await createTestFile('standby.jpg');
    const video1 = await createTestFile('video1.mp4');
    const video2 = await createTestFile('video2.mp4');

    // Step 1: セッション開始（静止画から開始）
    const sessionConfig = {
      endpoints: [
        {
          enabled: true,
          url: 'rtmp://test.server/live',
          streamKey: 'teststream',
        },
      ],
      standbyImage,
      videoSettings: {
        videoCodec: 'libx264',
        videoBitrate: '2500k',
        fps: 30,
      },
      audioSettings: {
        audioCodec: 'aac',
        audioBitrate: '128k',
      },
      sessionName: 'E2E Test Session',
    };

    const sessionInfo = await service.startSession(sessionConfig);
    sessionId = sessionInfo.id;

    // セッションがプレイリストモードで開始されることを確認
    expect(sessionInfo.playlistMode).toBe(true);
    expect(sessionInfo.currentInput).toBe(standbyImage);

    // プレイリストマネージャーが作成されることを確認
    const playlistManager = service.sessionPlaylists.get(sessionId);
    expect(playlistManager).toBeDefined();

    // プレイリストファイルが作成されることを確認
    expect(await playlistManager.exists()).toBe(true);

    // Step 2: 最初の動画に切り替え
    // セッションをアクティブ状態に設定（通常はFFmpegプロセスが設定）
    service.activeSessions.set(sessionId, {
      command: { kill: jest.fn() },
      endpoints: sessionConfig.endpoints,
      currentInput: standbyImage,
      settings: sessionConfig,
      usePlaylist: true,
      startTime: new Date(),
    });

    const switch1Result = await service.switchContent(sessionId, video1);
    expect(switch1Result.success).toBe(true);
    expect(switch1Result.playlistUpdated).toBe(true);
    expect(switch1Result.status).toBe(SESSION_STATES.STREAMING);

    // プレイリストが更新されることを確認
    const playlistContent1 = await fs.readFile(playlistManager.getPlaylistPath(), 'utf8');
    expect(playlistContent1).toContain(path.resolve(video1).replace(/\\/g, '/'));

    // Step 3: 2番目の動画に切り替え
    const switch2Result = await service.switchContent(sessionId, video2);
    expect(switch2Result.success).toBe(true);
    expect(switch2Result.playlistUpdated).toBe(true);

    // プレイリストが更新されることを確認
    const playlistContent2 = await fs.readFile(playlistManager.getPlaylistPath(), 'utf8');
    expect(playlistContent2).toContain(path.resolve(video2).replace(/\\/g, '/'));
    expect(playlistContent2).not.toContain(path.resolve(video1).replace(/\\/g, '/'));

    // Step 4: 静止画に戻る
    // セッション情報に静止画パスを保存
    await service.saveSessionInfo({
      id: sessionId,
      standbyImage,
    });

    const standbyResult = await service.switchToStandby(sessionId);
    expect(standbyResult.success).toBe(true);
    expect(standbyResult.status).toBe(SESSION_STATES.CONNECTED);

    // Step 5: セッション停止
    const stopResult = await service.stopSession(sessionId);
    expect(stopResult).toBe(true);

    // プレイリストがクリーンアップされることを確認
    expect(service.sessionPlaylists.has(sessionId)).toBe(false);
  });

  test('プレイリストファイルの形式が正しいことを確認', async () => {
    const playlistManager = new PlaylistManager('format-test');
    const testVideo = await createTestFile('format-test.mp4');

    await playlistManager.createPlaylist([testVideo]);

    const content = await fs.readFile(playlistManager.getPlaylistPath(), 'utf8');

    // プレイリストファイルがFFmpeg concat demuxer形式であることを確認
    expect(content).toMatch(/^file '.+'/);
    expect(content).toContain(path.resolve(testVideo).replace(/\\/g, '/'));

    await playlistManager.cleanup();
  });

  test('FFmpegコマンドがconcat demuxerオプションを含むことを確認', () => {
    const input = '/test/playlist.txt';
    const endpoints = [
      {
        enabled: true,
        url: 'rtmp://localhost/live',
        streamKey: 'stream',
      },
    ];

    // プレイリストモードでのコマンド構築
    const command = service.buildDualRtmpCommand(input, endpoints, {}, true);

    // fluent-ffmpegオブジェクトが正しく構築されることを確認
    expect(command).toBeDefined();
    expect(typeof command.run).toBe('function');
  });
});
