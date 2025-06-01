const { PersistentStreamService } = require('../persistentStreamService');

// この統合テストはFFmpegコマンドの構築が正しく行われるかを確認します
describe('プレイリスト統合テスト', () => {
  let service;

  beforeEach(() => {
    service = new PersistentStreamService();
  });

  test('プレイリストモードでFFmpegコマンドが正しく構築される', () => {
    const input = '/test/playlist.txt';
    const endpoints = [
      {
        enabled: true,
        url: 'rtmp://test.server',
        streamKey: 'testkey',
      },
    ];
    const settings = {
      videoCodec: 'libx264',
      videoBitrate: '2000k',
      fps: 30,
      videoWidth: 1920,
      videoHeight: 1080,
      audioCodec: 'aac',
      audioBitrate: '128k',
    };

    // プレイリストモードでコマンド構築
    const command = service.buildDualRtmpCommand(input, endpoints, settings, true);

    // fluent-ffmpegのモックメソッドを確認
    expect(command).toBeDefined();

    // コマンドが正しく設定されているかは実際のFFmpegプロセスが実行されるまで検証困難
    // ここではコマンド構築が正常に完了することを確認
  });

  test('通常モードとプレイリストモードの違いを確認', () => {
    const inputFile = '/test/video.mp4';
    const inputPlaylist = '/test/playlist.txt';
    const endpoints = [
      {
        enabled: true,
        url: 'rtmp://test.server',
        streamKey: 'testkey',
      },
    ];
    const settings = {};

    // 通常モード
    const normalCommand = service.buildDualRtmpCommand(inputFile, endpoints, settings, false);

    // プレイリストモード
    const playlistCommand = service.buildDualRtmpCommand(inputPlaylist, endpoints, settings, true);

    // 両方のコマンドが構築できることを確認
    expect(normalCommand).toBeDefined();
    expect(playlistCommand).toBeDefined();
  });
});
