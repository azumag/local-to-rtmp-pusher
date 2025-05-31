// モック設定
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(() => Promise.resolve(false)),
  ensureDir: jest.fn(() => Promise.resolve()),
  writeJSON: jest.fn(() => Promise.resolve()),
  readJSON: jest.fn(() => Promise.resolve({ endpoints: [] })),
}));
jest.mock('../../utils/fileUtils', () => ({
  getCacheDir: jest.fn(() => '/tmp/test-cache'),
  fileExists: jest.fn(() => Promise.resolve(true)),
  generateUniqueId: jest.fn(() => 'test-unique-id'),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const request = require('supertest');
const express = require('express');

// SESSION_STATESを先に取得
const SESSION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  STREAMING: 'streaming',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};

// モックサービスインスタンス
const mockService = {
  startSession: jest.fn(),
  stopSession: jest.fn(),
  getSessionStatus: jest.fn(),
  getActiveSessions: jest.fn(),
  switchToFile: jest.fn(),
  switchToStandby: jest.fn(),
  uploadStandbyImage: jest.fn(),
};

// PersistentStreamServiceをモック
jest.mock('../../services/persistentStreamService', () => ({
  PersistentStreamService: jest.fn(() => mockService),
  SESSION_STATES,
}));

const persistentStreamRoutes = require('../persistentStream');

describe('Persistent Stream API Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/stream', persistentStreamRoutes);

    // エラーハンドリングミドルウェア
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal Server Error',
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /session/start', () => {
    test('有効なリクエストでセッションが開始される', async () => {
      const sessionData = {
        id: 'test-session-id',
        status: SESSION_STATES.CONNECTING,
        endpoints: [{ url: 'rtmp://test.com/live', streamKey: 'key123', enabled: true }],
      };

      mockService.startSession.mockResolvedValue(sessionData);

      const requestBody = {
        endpoints: [{ url: 'rtmp://test.com/live', streamKey: 'key123', enabled: true }],
        sessionName: 'Test Session',
      };

      const response = await request(app).post('/api/stream/session/start').send(requestBody);

      if (response.status !== 200) {
        console.log('Response error:', response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sessionData);
      expect(mockService.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoints: requestBody.endpoints,
          sessionName: requestBody.sessionName,
        })
      );
    });

    test('エンドポイントが提供されない場合はエラー', async () => {
      const response = await request(app).post('/api/stream/session/start').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('エンドポイント設定が必要です');
    });

    test('有効なエンドポイントがない場合はエラー', async () => {
      const response = await request(app)
        .post('/api/stream/session/start')
        .send({
          endpoints: [{ url: 'rtmp://test.com/live', enabled: false }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('少なくとも1つのRTMPエンドポイントを有効にしてください');
    });

    test('無効なRTMP URLの場合はエラー', async () => {
      const response = await request(app)
        .post('/api/stream/session/start')
        .send({
          endpoints: [{ url: 'http://invalid.com', enabled: true }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('有効なRTMP URLを指定してください');
    });
  });

  describe('POST /session/stop/:sessionId', () => {
    test('セッションが正常に停止される', async () => {
      mockService.stopSession.mockResolvedValue(true);

      const response = await request(app).post('/api/stream/session/stop/test-session-id');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('セッションが正常に停止しました');
      expect(response.body.sessionId).toBe('test-session-id');
      expect(mockService.stopSession).toHaveBeenCalledWith('test-session-id');
    });

    test('存在しないセッションの場合はエラー', async () => {
      mockService.stopSession.mockResolvedValue(false);

      const response = await request(app).post('/api/stream/session/stop/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('指定されたセッションが見つかりません');
    });
  });

  describe('GET /session/status/:sessionId', () => {
    test('セッション状態が正常に取得される', async () => {
      const sessionStatus = {
        id: 'test-session-id',
        status: SESSION_STATES.CONNECTED,
        isActive: true,
        uptime: 300,
      };

      mockService.getSessionStatus.mockResolvedValue(sessionStatus);

      const response = await request(app).get('/api/stream/session/status/test-session-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sessionStatus);
      expect(mockService.getSessionStatus).toHaveBeenCalledWith('test-session-id');
    });

    test('存在しないセッションの場合は404', async () => {
      mockService.getSessionStatus.mockResolvedValue(null);

      const response = await request(app).get('/api/stream/session/status/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('セッションが見つかりません');
    });
  });

  describe('GET /session/active', () => {
    test('アクティブセッション一覧が取得される', async () => {
      const startTime = new Date();
      const activeSessions = [
        { id: 'session1', startTime },
        { id: 'session2', startTime },
      ];

      mockService.getActiveSessions.mockReturnValue(activeSessions);

      const response = await request(app).get('/api/stream/session/active');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 'session1', startTime: startTime.toISOString() },
        { id: 'session2', startTime: startTime.toISOString() },
      ]);
    });
  });

  describe('POST /content/switch', () => {
    test('ファイル切り替えが正常に実行される', async () => {
      const switchResult = {
        success: true,
        sessionId: 'test-session-id',
        newInput: '/path/to/video.mp4',
        status: SESSION_STATES.STREAMING,
      };

      mockService.switchToFile.mockResolvedValue(switchResult);

      const requestBody = {
        sessionId: 'test-session-id',
        fileId: 'file123',
        isGoogleDriveFile: false,
      };

      const response = await request(app).post('/api/stream/content/switch').send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(switchResult);
      expect(mockService.switchToFile).toHaveBeenCalledWith('test-session-id', 'file123', false);
    });

    test('セッションIDが提供されない場合はエラー', async () => {
      const response = await request(app)
        .post('/api/stream/content/switch')
        .send({ fileId: 'file123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('セッションIDとファイルIDが必要です');
    });

    test('ファイルIDが提供されない場合はエラー', async () => {
      const response = await request(app)
        .post('/api/stream/content/switch')
        .send({ sessionId: 'test-session-id' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('セッションIDとファイルIDが必要です');
    });
  });

  describe('POST /content/idle', () => {
    test('静止画への切り替えが正常に実行される', async () => {
      const switchResult = {
        success: true,
        sessionId: 'test-session-id',
        newInput: '/path/to/standby.jpg',
        status: SESSION_STATES.CONNECTED,
      };

      mockService.switchToStandby.mockResolvedValue(switchResult);

      const response = await request(app)
        .post('/api/stream/content/idle')
        .send({ sessionId: 'test-session-id' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(switchResult);
      expect(mockService.switchToStandby).toHaveBeenCalledWith('test-session-id');
    });

    test('セッションIDが提供されない場合はエラー', async () => {
      const response = await request(app).post('/api/stream/content/idle').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('セッションIDが必要です');
    });
  });

  describe('GET /session/states', () => {
    test('セッション状態一覧が取得される', async () => {
      const response = await request(app).get('/api/stream/session/states');

      expect(response.status).toBe(200);
      expect(response.body.states).toBeDefined();
      expect(response.body.description).toBeDefined();
      expect(response.body.states.CONNECTED).toBe('connected');
    });
  });

  describe('エラーハンドリング', () => {
    test('サービスエラーが適切に処理される', async () => {
      mockService.startSession.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/stream/session/start')
        .send({
          endpoints: [{ url: 'rtmp://test.com/live', enabled: true }],
        });

      expect(response.status).toBe(500);
    });
  });
});
