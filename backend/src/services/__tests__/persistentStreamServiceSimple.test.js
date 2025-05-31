// シンプルなPersistentStreamServiceのテスト
describe('PersistentStreamService Simple Tests', () => {
  test('SESSION_STATESが正しく定義されている', () => {
    // モックなしで定数をテスト
    const expectedStates = {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      STREAMING: 'streaming',
      RECONNECTING: 'reconnecting',
      ERROR: 'error',
    };

    // 実際にrequireして確認
    jest.isolateModules(() => {
      // 必要な依存関係をモック
      jest.doMock('../../utils/fileUtils', () => ({
        getCacheDir: () => '/tmp/test',
        fileExists: () => Promise.resolve(true),
        generateUniqueId: () => 'test-id',
      }));

      jest.doMock('fs-extra', () => ({
        pathExists: () => Promise.resolve(true),
        readJSON: () => Promise.resolve({ sessions: [] }),
        writeJSON: () => Promise.resolve(),
        ensureDir: () => Promise.resolve(),
        writeFile: () => Promise.resolve(),
        existsSync: () => true,
        createWriteStream: () => ({ write: jest.fn(), end: jest.fn() }),
      }));

      jest.doMock('fluent-ffmpeg', () => {
        const mockCommand = {
          input: jest.fn().mockReturnThis(),
          inputOptions: jest.fn().mockReturnThis(),
          videoCodec: jest.fn().mockReturnThis(),
          videoBitrate: jest.fn().mockReturnThis(),
          fps: jest.fn().mockReturnThis(),
          size: jest.fn().mockReturnThis(),
          audioCodec: jest.fn().mockReturnThis(),
          audioBitrate: jest.fn().mockReturnThis(),
          audioFrequency: jest.fn().mockReturnThis(),
          audioChannels: jest.fn().mockReturnThis(),
          addOption: jest.fn().mockReturnThis(),
          format: jest.fn().mockReturnThis(),
          output: jest.fn().mockReturnThis(),
          on: jest.fn().mockReturnThis(),
          run: jest.fn().mockReturnThis(),
        };
        return jest.fn(() => mockCommand);
      });

      const { SESSION_STATES } = require('../persistentStreamService');

      expect(SESSION_STATES).toEqual(expectedStates);
    });
  });

  test('PersistentStreamServiceクラスが正しく作成される', () => {
    jest.isolateModules(() => {
      // 依存関係をモック
      jest.doMock('../../utils/fileUtils', () => ({
        getCacheDir: () => '/tmp/test',
        fileExists: () => Promise.resolve(true),
        generateUniqueId: () => 'test-id',
      }));

      jest.doMock('fs-extra', () => ({
        pathExists: () => Promise.resolve(true),
        readJSON: () => Promise.resolve({ sessions: [] }),
        writeJSON: () => Promise.resolve(),
        ensureDir: () => Promise.resolve(),
        writeFile: () => Promise.resolve(),
        existsSync: () => true,
        createWriteStream: () => ({ write: jest.fn(), end: jest.fn() }),
      }));

      jest.doMock('fluent-ffmpeg', () => {
        const mockCommand = {
          input: jest.fn().mockReturnThis(),
          inputOptions: jest.fn().mockReturnThis(),
          videoCodec: jest.fn().mockReturnThis(),
          videoBitrate: jest.fn().mockReturnThis(),
          fps: jest.fn().mockReturnThis(),
          size: jest.fn().mockReturnThis(),
          audioCodec: jest.fn().mockReturnThis(),
          audioBitrate: jest.fn().mockReturnThis(),
          audioFrequency: jest.fn().mockReturnThis(),
          audioChannels: jest.fn().mockReturnThis(),
          addOption: jest.fn().mockReturnThis(),
          format: jest.fn().mockReturnThis(),
          output: jest.fn().mockReturnThis(),
          on: jest.fn().mockReturnThis(),
          run: jest.fn().mockReturnThis(),
        };
        return jest.fn(() => mockCommand);
      });

      const { PersistentStreamService } = require('../persistentStreamService');

      const service = new PersistentStreamService();

      expect(service).toBeDefined();
      expect(service.activeSessions).toBeDefined();
      expect(service.reconnectAttempts).toBeDefined();
      expect(service.maxReconnectAttempts).toBe(10);
      expect(service.reconnectDelay).toBe(10000);
    });
  });
});
