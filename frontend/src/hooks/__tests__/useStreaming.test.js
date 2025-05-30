import { renderHook, act, waitFor } from '@testing-library/react';
import useStreaming from '../useStreaming';
import { streamService } from '../../services/streamService';

// Mock the stream service
jest.mock('../../services/streamService');

describe('useStreaming', () => {
  const mockStreams = [
    {
      id: 'stream-1',
      fileId: 'file-1',
      filePath: '/uploads/video1.mp4',
      outputUrl: 'rtmp://localhost/live/stream1',
      status: 'active',
      startTime: '2024-01-01T00:00:00Z'
    },
    {
      id: 'stream-2',
      fileId: 'file-2',
      filePath: '/uploads/video2.mp4',
      outputUrl: 'rtmp://localhost/live/stream2',
      status: 'active',
      startTime: '2024-01-01T01:00:00Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    streamService.getStreams.mockResolvedValue(mockStreams);
    streamService.startStream.mockResolvedValue({ id: 'new-stream', status: 'started' });
    streamService.stopStream.mockResolvedValue({ success: true });
    streamService.getStreamStatus.mockResolvedValue({ status: 'active' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches streams on mount', async () => {
    const { result } = renderHook(() => useStreaming());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.activeStreams).toEqual(mockStreams);
      expect(result.current.error).toBe(null);
    });

    expect(streamService.getStreams).toHaveBeenCalledTimes(1);
  });

  it('handles fetch error', async () => {
    const errorMessage = 'Network error';
    streamService.getStreams.mockRejectedValueOnce(new Error(errorMessage));

    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.activeStreams).toEqual([]);
    });
  });

  it('starts a stream successfully', async () => {
    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const fileId = 'file-3';
    const filePath = '/uploads/video3.mp4';
    const outputUrl = 'rtmp://localhost/live/stream3';
    const settings = { videoCodec: 'libx264' };

    await act(async () => {
      const response = await result.current.startStream(fileId, filePath, outputUrl, settings);
      expect(response).toEqual({ id: 'new-stream', status: 'started' });
    });

    expect(streamService.startStream).toHaveBeenCalledWith(fileId, filePath, outputUrl, settings);
    expect(streamService.getStreams).toHaveBeenCalledTimes(2); // Initial + after start
  });

  it('handles start stream error', async () => {
    const errorMessage = 'FFmpeg not found';
    streamService.startStream.mockRejectedValueOnce({
      response: { data: { error: errorMessage } }
    });

    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(
        result.current.startStream('file-3', '/path', 'rtmp://localhost')
      ).rejects.toThrow(errorMessage);
    });

    expect(result.current.error).toBe(errorMessage);
  });

  it('stops a stream successfully', async () => {
    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const streamId = 'stream-1';

    await act(async () => {
      await result.current.stopStream(streamId);
    });

    expect(streamService.stopStream).toHaveBeenCalledWith(streamId);
    expect(streamService.getStreams).toHaveBeenCalledTimes(2); // Initial + after stop
  });

  it('checks if file is streaming', async () => {
    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFileStreaming('file-1')).toBe(true);
    expect(result.current.isFileStreaming('file-3')).toBe(false);
  });

  it('gets stream for specific file', async () => {
    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getFileStream('file-1')).toEqual(mockStreams[0]);
    expect(result.current.getFileStream('file-3')).toBeUndefined();
  });

  it('refreshes streams periodically', async () => {
    renderHook(() => useStreaming());

    await waitFor(() => {
      expect(streamService.getStreams).toHaveBeenCalledTimes(1);
    });

    // Fast-forward 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(streamService.getStreams).toHaveBeenCalledTimes(2);
    });

    // Fast-forward another 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(streamService.getStreams).toHaveBeenCalledTimes(3);
    });
  });

  it('cleans up interval on unmount', async () => {
    const { unmount } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(streamService.getStreams).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Should not call getStreams again after unmount
    expect(streamService.getStreams).toHaveBeenCalledTimes(1);
  });

  it('manually refreshes streams', async () => {
    const { result } = renderHook(() => useStreaming());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshStreams();
    });

    expect(streamService.getStreams).toHaveBeenCalledTimes(2);
  });
});