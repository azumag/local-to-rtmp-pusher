import { useState, useEffect, useCallback } from 'react';
import { listActiveStreams, startStream as startStreamService, stopStream as stopStreamService, getStreamStatus as getStreamStatusService } from '../services/streamService';

const useStreaming = () => {
  const [activeStreams, setActiveStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch active streams
  const fetchStreams = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await listActiveStreams();
      setActiveStreams(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch streams');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start a new stream
  const startStream = useCallback(async (streamData) => {
    try {
      setError(null);
      const result = await startStreamService(streamData);
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
      await stopStreamService(streamId);
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
      const response = await getStreamStatusService(streamId);
      return response.data;
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