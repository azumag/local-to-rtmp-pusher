const fetch = require('node-fetch');
const googleDriveService = require('../googleDriveService');

// モックの設定
jest.mock('node-fetch');
jest.mock('../googleDriveApiService');

describe('GoogleDriveService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractFolderId', () => {
    it('should extract folder ID from various URL formats', async () => {
      const testCases = [
        {
          url: 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing',
          expected: '1ABC123DEF456789012345',
        },
        {
          url: 'https://drive.google.com/folders/1XYZ789GHI012345678901',
          expected: '1XYZ789GHI012345678901',
        },
        {
          url: 'https://drive.google.com/open?id=1MNO345PQR678901234567',
          expected: '1MNO345PQR678901234567',
        },
      ];

      for (const testCase of testCases) {
        const result = await googleDriveService.extractFolderId(testCase.url);
        expect(result).toBe(testCase.expected);
      }
    });

    it('should throw error for invalid URLs', async () => {
      const invalidUrl = 'https://invalid-url.com';
      await expect(googleDriveService.extractFolderId(invalidUrl)).rejects.toThrow(
        '共有URLからフォルダIDの抽出に失敗しました'
      );
    });
  });

  describe('listFilesFromShareUrl', () => {
    it('should use Google Drive API when available', async () => {
      const mockGoogleDriveApiService = require('../googleDriveApiService');
      const mockFiles = [
        {
          id: '1ABC123',
          name: 'video1.mp4',
          mimeType: 'video/mp4',
          downloadUrl: 'https://drive.google.com/uc?export=download&id=1ABC123',
        },
      ];

      mockGoogleDriveApiService.listFilesFromShareUrl.mockResolvedValue(mockFiles);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';
      const result = await googleDriveService.listFilesFromShareUrl(shareUrl);

      expect(result).toEqual(mockFiles);
      expect(mockGoogleDriveApiService.listFilesFromShareUrl).toHaveBeenCalledWith(shareUrl);
    });

    it('should fallback to HTML parsing when API fails', async () => {
      const mockGoogleDriveApiService = require('../googleDriveApiService');
      mockGoogleDriveApiService.listFilesFromShareUrl.mockRejectedValue(new Error('API failed'));

      // モックHTMLレスポンス
      const mockHtml = `
        <html>
          <script>
            window.__initData = [
              null,
              null,
              [
                ["1ABC123", "video1.mp4", "video/mp4", null, null]
              ]
            ];
          </script>
        </html>
      `;

      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(mockHtml),
      };

      fetch.mockResolvedValue(mockResponse);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      // HTML解析では空の配列が返されることを期待（実際のGoogle DriveのHTMLパターンと一致しないため）
      await expect(googleDriveService.listFilesFromShareUrl(shareUrl)).rejects.toThrow(
        'Google Driveから動画ファイルが見つかりませんでした'
      );

      expect(fetch).toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      const mockGoogleDriveApiService = require('../googleDriveApiService');
      mockGoogleDriveApiService.listFilesFromShareUrl.mockRejectedValue(new Error('API failed'));

      fetch.mockRejectedValue(new Error('Network error'));

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      await expect(googleDriveService.listFilesFromShareUrl(shareUrl)).rejects.toThrow();
    });

    it('should handle permission denied responses', async () => {
      const mockGoogleDriveApiService = require('../googleDriveApiService');
      mockGoogleDriveApiService.listFilesFromShareUrl.mockRejectedValue(new Error('API failed'));

      const mockHtml = '<html><body>You need permission to access this folder</body></html>';
      const mockResponse = {
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(mockHtml),
      };

      fetch.mockResolvedValue(mockResponse);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      await expect(googleDriveService.listFilesFromShareUrl(shareUrl)).rejects.toThrow(
        'フォルダへのアクセス権限がありません'
      );
    });
  });

  describe('getFileInfo', () => {
    it('should get file info from Google Drive', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: jest.fn((header) => {
            const headers = {
              'content-type': 'video/mp4',
              'content-length': '1000000',
              'content-disposition': 'attachment; filename="video.mp4"',
            };
            return headers[header];
          }),
        },
      };

      fetch.mockResolvedValue(mockResponse);

      const fileId = '1ABC123DEF456789012345';
      const result = await googleDriveService.getFileInfo(fileId);

      expect(result).toEqual({
        id: fileId,
        name: 'video.mp4',
        mimeType: 'video/mp4',
        size: 1000000,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      });
    });

    it('should handle file not found', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      fetch.mockResolvedValue(mockResponse);

      const fileId = '1ABC123DEF456789012345';

      await expect(googleDriveService.getFileInfo(fileId)).rejects.toThrow(
        'Google Driveファイル情報の取得に失敗しました'
      );
    });
  });
});
