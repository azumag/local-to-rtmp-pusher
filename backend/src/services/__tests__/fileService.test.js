const fs = require('fs-extra');
const path = require('path');
const fileService = require('../fileService');
const { NotFoundError, ValidationError } = require('../../errors/AppError');

jest.mock('fs-extra');

describe('FileService', () => {
  const mockFilesData = [
    {
      id: '1',
      name: 'test-video.mp4',
      path: '/uploads/test-video.mp4',
      size: 1024000,
      uploadDate: '2024-01-01T00:00:00.000Z'
    },
    {
      id: '2', 
      name: 'another-video.mp4',
      path: '/uploads/another-video.mp4',
      size: 2048000,
      uploadDate: '2024-01-02T00:00:00.000Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    fs.ensureDir.mockResolvedValue();
    fs.pathExists.mockResolvedValue(true);
    fs.readJson.mockResolvedValue(mockFilesData);
    fs.writeJson.mockResolvedValue();
    fs.remove.mockResolvedValue();
    fs.stat.mockResolvedValue({ size: 1024000 });
  });

  describe('getFiles', () => {
    it('should return all files', async () => {
      const files = await fileService.getFiles();
      
      expect(files).toEqual(mockFilesData);
      expect(fs.readJson).toHaveBeenCalled();
    });

    it('should return empty array when no files exist', async () => {
      fs.readJson.mockRejectedValue(new Error('ENOENT'));
      
      const files = await fileService.getFiles();
      
      expect(files).toEqual([]);
    });
  });

  describe('getFileById', () => {
    it('should return file by id', async () => {
      const file = await fileService.getFileById('1');
      
      expect(file).toEqual(mockFilesData[0]);
    });

    it('should throw NotFoundError for non-existent file', async () => {
      await expect(fileService.getFileById('999'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('saveFile', () => {
    it('should save file metadata', async () => {
      const fileData = {
        filename: 'new-video.mp4',
        path: '/uploads/new-video.mp4',
        size: 3072000
      };
      
      const result = await fileService.saveFile(fileData);
      
      expect(result).toMatchObject({
        name: fileData.filename,
        path: fileData.path,
        size: fileData.size
      });
      expect(result.id).toBeDefined();
      expect(result.uploadDate).toBeDefined();
      expect(fs.writeJson).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file and metadata', async () => {
      const result = await fileService.deleteFile('1');
      
      expect(result).toBe(true);
      expect(fs.remove).toHaveBeenCalledWith(mockFilesData[0].path);
      expect(fs.writeJson).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent file', async () => {
      await expect(fileService.deleteFile('999'))
        .rejects.toThrow(NotFoundError);
    });

    it('should handle file removal error gracefully', async () => {
      fs.remove.mockRejectedValue(new Error('Permission denied'));
      
      // Should still remove from metadata even if file removal fails
      const result = await fileService.deleteFile('1');
      
      expect(result).toBe(true);
      expect(fs.writeJson).toHaveBeenCalled();
    });
  });

  describe('validateFile', () => {
    it('should validate file successfully', async () => {
      const file = {
        mimetype: 'video/mp4',
        size: 1024000
      };
      
      const result = await fileService.validateFile(file);
      
      expect(result).toBe(true);
    });

    it('should throw ValidationError for invalid file type', async () => {
      const file = {
        mimetype: 'text/plain',
        size: 1024
      };
      
      await expect(fileService.validateFile(file))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for oversized file', async () => {
      const file = {
        mimetype: 'video/mp4',
        size: 6 * 1024 * 1024 * 1024 // 6GB
      };
      
      await expect(fileService.validateFile(file))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getFileStats', () => {
    it('should return file statistics', async () => {
      fs.stat.mockResolvedValue({
        size: 2048000,
        mtime: new Date('2024-01-01'),
        ctime: new Date('2024-01-01')
      });
      
      const stats = await fileService.getFileStats('/uploads/test.mp4');
      
      expect(stats).toMatchObject({
        size: 2048000,
        modifiedTime: expect.any(Date),
        createdTime: expect.any(Date)
      });
    });

    it('should throw NotFoundError for non-existent file', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      
      await expect(fileService.getFileStats('/non-existent.mp4'))
        .rejects.toThrow(NotFoundError);
    });
  });
});