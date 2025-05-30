import { useState, useEffect, useCallback } from 'react';
import { streamService } from '../services/streamService';

const useStreaming = () => {
  const [activeStreams, setActiveStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch active streams
  const fetchStreams = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const streams = await streamService.getStreams();
      setActiveStreams(streams);
    } catch (err) {
      setError(err.message || 'Failed to fetch streams');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start a new stream
  const startStream = useCallback(async (fileId, filePath, outputUrl, settings = {}) => {
    try {
      setError(null);
      const result = await streamService.startStream(fileId, filePath, outputUrl, settings);
      await fetchStreams(); // Refresh stream list
      return result;
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to start stream';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [fetchStreams]);

  // Stop a stream
  const stopStream = useCallback(async (streamId) => {
    try {
      setError(null);
      await streamService.stopStream(streamId);
      await fetchStreams(); // Refresh stream list
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to stop stream';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [fetchStreams]);

  // Get stream status
  const getStreamStatus = useCallback(async (streamId) => {
    try {
      const status = await streamService.getStreamStatus(streamId);
      return status;
    } catch (err) {
      console.error('Failed to get stream status:', err);
      return null;
    }
  }, []);

  // Check if a file is currently streaming
  const isFileStreaming = useCallback((fileId) => {
    return activeStreams.some(stream => stream.fileId === fileId);
  }, [activeStreams]);

  // Get stream for a specific file
  const getFileStream = useCallback((fileId) => {
    return activeStreams.find(stream => stream.fileId === fileId);
  }, [activeStreams]);

  // Initial fetch
  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(fetchStreams, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchStreams]);

  return {
    activeStreams,
    isLoading,
    error,
    startStream,
    stopStream,
    getStreamStatus,
    isFileStreaming,
    getFileStream,
    refreshStreams: fetchStreams
  };
};

export default useStreaming;