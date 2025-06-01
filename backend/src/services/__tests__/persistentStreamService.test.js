// テスト用のモック設定
jest.mock('fluent-ffmpeg');
jest.mock('fs-extra');
jest.mock('../../utils/fileUtils', () => ({
  getCacheDir: jest.fn(() => '/tmp/test-cache'),
  fileExists: jest.fn(() => Promise.resolve(true)),
  generateUniqueId: jest.fn(() => 'test-unique-id'),
  writeJSONSafely: jest.fn(() => Promise.resolve()),
}));

const fs = require('fs-extra');
const path = require('path');
const { PersistentStreamService, SESSION_STATES } = require('../persistentStreamService');
const { getCacheDir } = require('../../utils/fileUtils');

describe('PersistentStreamService', () => {
  let service;
  let mockCacheDir;

  beforeEach(() => {
    service = new PersistentStreamService();
    mockCacheDir = '/tmp/test-cache';

    // モックの設定
    getCacheDir.mockReturnValue(mockCacheDir);
    fs.pathExists.mockResolvedValue(true);
    fs.readJSON.mockResolvedValue({ sessions: [] });
    fs.writeJSON.mockResolvedValue();
    fs.ensureDir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('セッション初期化', () => {
    test('セッションDBが初期化される', async () => {
      const db = await service.initializeSessionDb();

      expect(db).toEqual({ sessions: [] });
      expect(fs.readJSON).toHaveBeenCalled();
    });

    test('セッションDBが存在しない場合は作成される', async () => {
      const { fileExists } = require('../../utils/fileUtils');
      fileExists.mockResolvedValueOnce(false);

      await service.initializeSessionDb();

      expect(fs.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining('persistent-sessions.json'),
        { sessions: [] }
      );
    });
  });

  describe('セッション情報管理', () => {
    test('新しいセッション情報が保存される', async () => {
      const sessionData = {
        name: 'Test Session',
        endpoints: [{ url: 'rtmp://test.com/live', streamKey: 'key123', enabled: true }],
      };

      const result = await service.saveSessionInfo(sessionData);

      expect(result).toMatchObject({
        name: 'Test Session',
        endpoints: sessionData.endpoints,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    test('既存のセッション情報が更新される', async () => {
      const existingSession = {
        id: 'test-session-id',
        name: 'Original Session',
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      fs.readJSON.mockResolvedValue({
        sessions: [existingSession],
      });

      const updateData = {
        id: 'test-session-id',
        name: 'Updated Session',
      };

      const result = await service.saveSessionInfo(updateData);

      expect(result.name).toBe('Updated Session');
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('デフォルト静止画', () => {
    test('デフォルト静止画パスが取得される', () => {
      const expectedPath = path.join(mockCacheDir, 'standby', 'default.jpg');

      const result = service.getDefaultStandbyImagePath();

      expect(result).toBe(expectedPath);
    });
  });

  describe('セッション状態管理', () => {
    test('セッション状態が更新される', async () => {
      const sessionId = 'test-session-id';
      const existingSession = { id: sessionId, status: SESSION_STATES.CONNECTING };

      fs.readJSON.mockResolvedValue({
        sessions: [existingSession],
      });

      await service.updateSessionStatus(sessionId, SESSION_STATES.CONNECTED);

      expect(fs.writeJSON).toHaveBeenCalled();
    });

    test('エラーメッセージ付きで状態が更新される', async () => {
      const sessionId = 'test-session-id';
      const existingSession = { id: sessionId, status: SESSION_STATES.CONNECTING };

      fs.readJSON.mockResolvedValue({
        sessions: [existingSession],
      });

      await service.updateSessionStatus(sessionId, SESSION_STATES.ERROR, 'Test error');

      expect(fs.writeJSON).toHaveBeenCalled();
    });
  });

  describe('アクティブセッション管理', () => {
    test('アクティブセッション一覧が取得される', () => {
      // アクティブセッションをモック
      service.activeSessions.set('session1', {
        startTime: new Date(),
        currentInput: '/path/to/file.mp4',
        endpoints: [{ url: 'rtmp://test.com', enabled: true }],
      });

      const result = service.getActiveSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session1');
    });

    test('アクティブセッションがない場合は空配列が返される', () => {
      const result = service.getActiveSessions();

      expect(result).toEqual([]);
    });
  });

  describe('セッション状態取得', () => {
    test('セッション状態が正しく取得される', async () => {
      const sessionInfo = {
        id: 'test-session-id',
        status: SESSION_STATES.CONNECTED,
        startedAt: '2025-01-01T00:00:00.000Z',
      };

      fs.readJSON.mockResolvedValue({
        sessions: [sessionInfo],
      });

      const result = await service.getSessionStatus('test-session-id');

      expect(result).toMatchObject(sessionInfo);
      expect(result.isActive).toBe(false);
      expect(result.uptime).toBeDefined();
    });

    test('存在しないセッションの場合はnullが返される', async () => {
      const result = await service.getSessionStatus('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('静止画アップロード', () => {
    test('静止画が正常にアップロードされる', async () => {
      const sessionId = 'test-session-id';
      const imageBuffer = Buffer.from('fake-image-data');
      const filename = 'test-image.jpg';

      const result = await service.uploadStandbyImage(sessionId, imageBuffer, filename);

      expect(result.success).toBe(true);
      expect(result.filename).toBe(filename);
      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${sessionId}-${filename}`),
        imageBuffer
      );
    });
  });

  describe('エラーハンドリング', () => {
    test('セッション情報取得でエラーが発生した場合', async () => {
      fs.readJSON.mockRejectedValueOnce(new Error('File read error'));
      const { writeJSONSafely } = require('../../utils/fileUtils');
      writeJSONSafely.mockRejectedValueOnce(new Error('Write failed'));

      const result = await service.getSessionInfo('test-id');
      expect(result).toBeNull();
    });

    test('セッション情報保存でエラーが発生した場合', async () => {
      fs.writeJSON.mockRejectedValue(new Error('File write error'));

      await expect(service.saveSessionInfo({ name: 'test' })).rejects.toThrow(
        'セッション情報の保存に失敗しました'
      );
    });
  });

  describe('SESSION_STATES定数', () => {
    test('全ての状態が定義されている', () => {
      expect(SESSION_STATES.DISCONNECTED).toBe('disconnected');
      expect(SESSION_STATES.CONNECTING).toBe('connecting');
      expect(SESSION_STATES.CONNECTED).toBe('connected');
      expect(SESSION_STATES.STREAMING).toBe('streaming');
      expect(SESSION_STATES.RECONNECTING).toBe('reconnecting');
      expect(SESSION_STATES.ERROR).toBe('error');
    });
  });

  describe('エンドポイント設定マージ', () => {
    test('グローバル設定をデフォルトとして使用', () => {
      const globalSettings = {
        videoCodec: 'libx264',
        videoBitrate: '2000k',
        fps: 30,
      };

      const result = service.mergeEndpointSettings(globalSettings, null);

      expect(result.videoCodec).toBe('libx264');
      expect(result.videoBitrate).toBe('2000k');
      expect(result.fps).toBe(30);
    });

    test('エンドポイント設定でグローバル設定を上書き', () => {
      const globalSettings = {
        videoCodec: 'libx264',
        videoBitrate: '2000k',
        fps: 30,
      };

      const endpointSettings = {
        videoBitrate: '4000k',
        fps: 60,
      };

      const result = service.mergeEndpointSettings(globalSettings, endpointSettings);

      expect(result.videoCodec).toBe('libx264'); // from global
      expect(result.videoBitrate).toBe('4000k'); // from endpoint
      expect(result.fps).toBe(60); // from endpoint
    });

    test('設定がない場合はデフォルト値を使用', () => {
      const result = service.mergeEndpointSettings(null, null);

      expect(result.videoCodec).toBe('libx264');
      expect(result.videoBitrate).toBe('2500k');
      expect(result.audioCodec).toBe('aac');
      expect(result.audioBitrate).toBe('128k');
    });
  });

  describe('FFmpegコマンド構築 - エンドポイント固有設定', () => {
    test('単一エンドポイントで固有設定のマージが正しく動作', () => {
      const endpoints = [
        {
          url: 'rtmp://test.com/live',
          streamKey: 'key1',
          enabled: true,
          videoSettings: { videoBitrate: '4000k', fps: 60 },
          audioSettings: { audioBitrate: '192k' },
        },
      ];

      const globalSettings = {
        videoBitrate: '2000k',
        fps: 30,
        audioBitrate: '128k',
      };

      // 設定のマージが正しく動作することをテスト
      const mergedSettings = service.mergeEndpointSettings(globalSettings, {
        ...endpoints[0].videoSettings,
        ...endpoints[0].audioSettings,
      });

      expect(mergedSettings.videoBitrate).toBe('4000k'); // endpoint setting
      expect(mergedSettings.fps).toBe(60); // endpoint setting
      expect(mergedSettings.audioBitrate).toBe('192k'); // endpoint setting
      expect(mergedSettings.videoCodec).toBe('libx264'); // default setting
    });

    test('複数エンドポイントで異なる設定のマージ', () => {
      const globalSettings = {
        videoBitrate: '2500k',
        fps: 30,
        audioBitrate: '128k',
      };

      // 高品質エンドポイント
      const hqSettings = service.mergeEndpointSettings(globalSettings, {
        videoBitrate: '6000k',
        fps: 60,
        audioBitrate: '320k',
      });

      // 低品質エンドポイント
      const lqSettings = service.mergeEndpointSettings(globalSettings, {
        videoBitrate: '1000k',
        fps: 30,
        audioBitrate: '96k',
      });

      // 高品質設定の確認
      expect(hqSettings.videoBitrate).toBe('6000k');
      expect(hqSettings.fps).toBe(60);
      expect(hqSettings.audioBitrate).toBe('320k');

      // 低品質設定の確認
      expect(lqSettings.videoBitrate).toBe('1000k');
      expect(lqSettings.fps).toBe(30);
      expect(lqSettings.audioBitrate).toBe('96k');
    });

    test('一部設定なしのエンドポイント（グローバル設定使用）', () => {
      const globalSettings = {
        videoBitrate: '2500k',
        fps: 30,
        audioBitrate: '128k',
      };

      // ビデオ設定のみカスタム
      const videoOnlySettings = service.mergeEndpointSettings(globalSettings, {
        videoBitrate: '4000k',
      });

      // オーディオ設定のみカスタム
      const audioOnlySettings = service.mergeEndpointSettings(globalSettings, {
        audioBitrate: '256k',
      });

      // ビデオのみカスタムの場合
      expect(videoOnlySettings.videoBitrate).toBe('4000k'); // custom
      expect(videoOnlySettings.audioBitrate).toBe('128k'); // global

      // オーディオのみカスタムの場合
      expect(audioOnlySettings.videoBitrate).toBe('2500k'); // global
      expect(audioOnlySettings.audioBitrate).toBe('256k'); // custom
    });
  });
});
