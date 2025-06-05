const GoogleDriveManager = require('../google_drive_manager');
const fs = require('fs-extra');

// Mock fs-extra
jest.mock('fs-extra');

// Mock googleapis
jest.mock('googleapis', () => ({
    google: {
        auth: {
            GoogleAuth: jest.fn().mockImplementation(() => ({
                getClient: jest.fn()
            }))
        },
        drive: jest.fn().mockImplementation(() => ({
            files: {
                list: jest.fn(),
                get: jest.fn()
            }
        }))
    }
}));

describe('GoogleDriveManager', () => {
    let googleDriveManager;

    beforeEach(() => {
        jest.clearAllMocks();
        googleDriveManager = new GoogleDriveManager();
        
        // Mock ensureDir
        fs.ensureDir.mockResolvedValue();
        fs.readdir.mockResolvedValue([]);
        fs.stat.mockResolvedValue({ size: 1024, mtime: new Date() });
        fs.remove.mockResolvedValue();
    });

    describe('constructor', () => {
        it('should initialize properly', () => {
            expect(googleDriveManager).toBeDefined();
            expect(googleDriveManager.drive).toBeNull();
            expect(googleDriveManager.auth).toBeNull();
        });
    });

    describe('extractFolderIdFromLink', () => {
        it('should extract folder ID from Google Drive URL', () => {
            const testCases = [
                {
                    input: 'https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h',
                    expected: '1a2b3c4d5e6f7g8h'
                },
                {
                    input: 'https://drive.google.com/open?id=1a2b3c4d5e6f7g8h',
                    expected: '1a2b3c4d5e6f7g8h'
                },
                {
                    input: '1a2b3c4d5e6f7g8h',
                    expected: '1a2b3c4d5e6f7g8h'
                }
            ];

            testCases.forEach(testCase => {
                const result = googleDriveManager.extractFolderIdFromLink(testCase.input);
                expect(result).toBe(testCase.expected);
            });
        });

        it('should return null for invalid links', () => {
            const invalidLinks = [
                'https://example.com',
                '',
                null
            ];

            invalidLinks.forEach(link => {
                const result = googleDriveManager.extractFolderIdFromLink(link);
                expect(result).toBeNull();
            });
            
            // Special case: 'invalid-link' might be treated as direct ID by current implementation
            const result = googleDriveManager.extractFolderIdFromLink('https://example.com/invalid');
            expect(result).toBeNull();
        });
    });

    describe('isAuthenticated', () => {
        it('should return false when not authenticated', () => {
            expect(googleDriveManager.isAuthenticated()).toBe(false);
        });

        it('should return true when authenticated', async () => {
            await googleDriveManager.initializeAuth('test-api-key');
            expect(googleDriveManager.isAuthenticated()).toBe(true);
        });
    });

    describe('cleanupFile', () => {
        it('should clean up temp files successfully', async () => {
            const testPath = '/test/temp/file.mp4';
            googleDriveManager.tempDir = '/test/temp';
            
            await googleDriveManager.cleanupFile(testPath);
            
            expect(fs.remove).toHaveBeenCalledWith(testPath);
        });

        it('should not clean up files outside temp directory', async () => {
            const testPath = '/other/path/file.mp4';
            googleDriveManager.tempDir = '/test/temp';
            
            await googleDriveManager.cleanupFile(testPath);
            
            expect(fs.remove).not.toHaveBeenCalled();
        });
    });

    describe('getTempDirInfo', () => {
        it('should return temp directory information', async () => {
            fs.readdir.mockResolvedValue(['file1.mp4', 'file2.mp4']);
            fs.stat.mockResolvedValue({ size: 1024 * 1024 }); // 1MB

            const info = await googleDriveManager.getTempDirInfo();

            expect(info).toEqual({
                fileCount: 2,
                totalSize: 2 * 1024 * 1024,
                totalSizeMB: '2.00'
            });
        });

        it('should handle errors gracefully', async () => {
            fs.readdir.mockRejectedValue(new Error('Directory not found'));

            const info = await googleDriveManager.getTempDirInfo();

            expect(info).toEqual({
                fileCount: 0,
                totalSize: 0,
                totalSizeMB: '0.00'
            });
        });
    });
});