// Google Drive APIをモック
const mockFilesList = jest.fn();
const mockDrive = {
  files: {
    list: mockFilesList,
  },
};

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => mockDrive),
  },
}));

const googleDriveApiService = require('../googleDriveApiService');

describe('GoogleDriveApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractFolderId', () => {
    it('should extract folder ID from standard Google Drive URL', () => {
      const url = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';
      const folderId = googleDriveApiService.extractFolderId(url);
      expect(folderId).toBe('1ABC123DEF456789012345');
    });

    it('should extract folder ID from folders URL', () => {
      const url = 'https://drive.google.com/folders/1XYZ789GHI012345678901';
      const folderId = googleDriveApiService.extractFolderId(url);
      expect(folderId).toBe('1XYZ789GHI012345678901');
    });

    it('should extract folder ID from open URL', () => {
      const url = 'https://drive.google.com/open?id=1MNO345PQR678901234567';
      const folderId = googleDriveApiService.extractFolderId(url);
      expect(folderId).toBe('1MNO345PQR678901234567');
    });

    it('should throw error for invalid URL', () => {
      const url = 'https://invalid-url.com';
      expect(() => googleDriveApiService.extractFolderId(url)).toThrow(
        'Google DriveのフォルダIDを抽出できませんでした'
      );
    });
  });

  describe('listFilesFromShareUrl', () => {
    it('should successfully list video files from Google Drive', async () => {
      const mockFiles = [
        {
          id: '1ABC123',
          name: 'video1.mp4',
          mimeType: 'video/mp4',
          size: '1000000',
        },
        {
          id: '2DEF456',
          name: 'video2.mov',
          mimeType: 'video/quicktime',
          size: '2000000',
        },
      ];

      mockFilesList.mockResolvedValue({
        data: { files: mockFiles },
      });

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';
      const result = await googleDriveApiService.listFilesFromShareUrl(shareUrl);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '1ABC123',
        name: 'video1.mp4',
        mimeType: 'video/mp4',
        size: '1000000',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=1ABC123',
      });

      expect(mockFilesList).toHaveBeenCalledWith({
        q: "'1ABC123DEF456789012345' in parents and mimeType contains 'video/'",
        fields: 'files(id, name, mimeType, size)',
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    });

    it('should handle API errors with proper error messages', async () => {
      const error = new Error('API Error');
      error.code = 403;
      mockFilesList.mockRejectedValue(error);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      await expect(googleDriveApiService.listFilesFromShareUrl(shareUrl)).rejects.toThrow(
        'Google Drive API: フォルダへのアクセス権限がありません。共有設定を確認してください。'
      );
    });

    it('should handle 404 errors', async () => {
      const error = new Error('Not Found');
      error.code = 404;
      mockFilesList.mockRejectedValue(error);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      await expect(googleDriveApiService.listFilesFromShareUrl(shareUrl)).rejects.toThrow(
        'Google Drive API: フォルダが見つかりません。URLを確認してください。'
      );
    });

    it('should handle general API errors', async () => {
      const error = new Error('General API Error');
      error.code = 500;
      mockFilesList.mockRejectedValue(error);

      const shareUrl = 'https://drive.google.com/drive/folders/1ABC123DEF456789012345?usp=sharing';

      await expect(googleDriveApiService.listFilesFromShareUrl(shareUrl)).rejects.toThrow(
        'Google Drive APIエラー: General API Error'
      );
    });
  });
});
