const fs = require('fs-extra');
const path = require('path');
const fileService = require('../fileService');

jest.mock('fs-extra');
jest.mock('../../utils/fileUtils', () => ({
  getCacheDir: () => '/test/cache'
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234'
}));

describe('FileService', () => {
  const mockFilesData = [
    {
      id: '1',
      name: 'test-video.mp4',
      path: '/uploads/test-video.mp4',
      size: 1024000,
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: '2', 
      name: 'another-video.mp4',
      path: '/uploads/another-video.mp4',
      size: 2048000,
      createdAt: '2024-01-02T00:00:00.000Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    fs.existsSync.mockReturnValue(true);
    fs.readJsonSync.mockReturnValue(mockFilesData);
    fs.writeJsonSync.mockImplementation(() => {});
    fs.removeSync.mockImplementation(() => {});
  });

  describe('getFiles', () => {
    it('should return all files', async () => {
      const files = await fileService.getFiles();
      
      expect(files).toEqual(mockFilesData);
      expect(fs.readJsonSync).toHaveBeenCalledWith('/test/cache/files.json');
    });

    it('should return empty array when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readJsonSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const files = await fileService.getFiles();
      
      expect(files).toEqual([]);
    });

    it('should return empty array when data is not an array', async () => {
      fs.readJsonSync.mockReturnValue('not an array');
      
      const files = await fileService.getFiles();
      
      expect(files).toEqual([]);
      expect(fs.writeJsonSync).toHaveBeenCalledWith('/test/cache/files.json', []);
    });
  });

  describe('listFiles', () => {
    it('should be an alias for getFiles', async () => {
      const files = await fileService.listFiles();
      
      expect(files).toEqual(mockFilesData);
    });
  });

  describe('getFileById', () => {
    it('should return file by id', async () => {
      const file = await fileService.getFileById('1');
      
      expect(file).toEqual(mockFilesData[0]);
    });

    it('should return undefined for non-existent file', async () => {
      const file = await fileService.getFileById('999');
      
      expect(file).toBeUndefined();
    });
  });

  describe('saveFileInfo', () => {
    it('should save file metadata', async () => {
      const fileData = {
        name: 'new-video.mp4',
        path: '/uploads/new-video.mp4',
        size: 3072000
      };
      
      const result = await fileService.saveFileInfo(fileData);
      
      expect(result).toMatchObject({
        id: 'test-uuid-1234',
        name: fileData.name,
        path: fileData.path,
        size: fileData.size,
        createdAt: expect.any(String)
      });
      expect(fs.writeJsonSync).toHaveBeenCalled();
    });

    it('should handle write error', async () => {
      fs.writeJsonSync.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      const fileData = {
        name: 'new-video.mp4',
        path: '/uploads/new-video.mp4'
      };
      
      await expect(fileService.saveFileInfo(fileData))
        .rejects.toThrow('ファイル情報の保存に失敗しました');
    });
  });

  describe('deleteFile', () => {
    it('should delete file and metadata', async () => {
      const result = await fileService.deleteFile('1');
      
      expect(result).toEqual({ success: true });
      expect(fs.removeSync).toHaveBeenCalledWith(mockFilesData[0].path);
      expect(fs.writeJsonSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent file', async () => {
      await expect(fileService.deleteFile('999'))
        .rejects.toThrow('ファイルが見つかりません');
    });

    it('should handle missing file path gracefully', async () => {
      fs.existsSync.mockReturnValue(false);
      
      const result = await fileService.deleteFile('1');
      
      expect(result).toEqual({ success: true });
      expect(fs.removeSync).not.toHaveBeenCalled();
      expect(fs.writeJsonSync).toHaveBeenCalled();
    });
  });

  describe('updateFileStatus', () => {
    it('should update file status', async () => {
      const updatedFile = await fileService.updateFileStatus('1', 'processing', {
        progress: 50
      });
      
      expect(updatedFile).toMatchObject({
        id: '1',
        status: 'processing',
        progress: 50,
        updatedAt: expect.any(String)
      });
      expect(fs.writeJsonSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent file', async () => {
      await expect(fileService.updateFileStatus('999', 'processing'))
        .rejects.toThrow('ファイルが見つかりません');
    });

    it('should handle write error', async () => {
      fs.writeJsonSync.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      await expect(fileService.updateFileStatus('1', 'processing'))
        .rejects.toThrow('ファイル状態の更新に失敗しました');
    });
  });
});