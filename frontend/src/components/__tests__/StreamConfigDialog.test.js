import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StreamConfigDialog from '../StreamConfigDialog';

describe('StreamConfigDialog', () => {
  const mockFile = {
    id: '1',
    name: 'test-video.mp4',
    path: '/uploads/test-video.mp4'
  };

  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onStart: jest.fn(),
    file: mockFile,
    isStreaming: false,
    streamError: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with file name in title', () => {
    render(<StreamConfigDialog {...defaultProps} />);
    
    expect(screen.getByText('Configure Stream - test-video.mp4')).toBeInTheDocument();
  });

  it('renders all form fields with default values', () => {
    render(<StreamConfigDialog {...defaultProps} />);
    
    expect(screen.getByLabelText('RTMP URL')).toHaveValue('rtmp://localhost:1935/live/stream');
    expect(screen.getByLabelText('Video Codec')).toBeInTheDocument();
    expect(screen.getByLabelText('Audio Codec')).toBeInTheDocument();
    expect(screen.getByLabelText('Video Bitrate')).toHaveValue('2000k');
    expect(screen.getByLabelText('Audio Bitrate')).toHaveValue('128k');
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
    expect(screen.getByLabelText('Encoding Preset')).toBeInTheDocument();
  });

  it('displays error when streamError prop is provided', () => {
    const errorMessage = 'Failed to start stream';
    render(<StreamConfigDialog {...defaultProps} streamError={errorMessage} />);
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('disables bitrate fields when copy codec is selected', async () => {
    render(<StreamConfigDialog {...defaultProps} />);
    
    const videoCodecSelect = screen.getByLabelText('Video Codec');
    const videoBitrateField = screen.getByLabelText('Video Bitrate');
    
    // Initially enabled
    expect(videoBitrateField).not.toBeDisabled();
    
    // Select copy codec
    fireEvent.mouseDown(videoCodecSelect);
    const copyOption = await screen.findByText('Copy (No re-encoding)');
    fireEvent.click(copyOption);
    
    // Should be disabled
    expect(videoBitrateField).toBeDisabled();
  });

  it('validates RTMP URL format', async () => {
    const user = userEvent.setup();
    render(<StreamConfigDialog {...defaultProps} />);
    
    const rtmpUrlField = screen.getByLabelText('RTMP URL');
    const startButton = screen.getByRole('button', { name: /start stream/i });
    
    // Clear and enter invalid URL
    await user.clear(rtmpUrlField);
    await user.type(rtmpUrlField, 'http://invalid-url');
    
    // Start button should be disabled
    expect(startButton).toBeDisabled();
    
    // Enter valid RTMP URL
    await user.clear(rtmpUrlField);
    await user.type(rtmpUrlField, 'rtmp://server:1935/live/stream');
    
    // Start button should be enabled
    expect(startButton).not.toBeDisabled();
  });

  it('calls onStart with correct parameters when Start Stream is clicked', async () => {
    const user = userEvent.setup();
    render(<StreamConfigDialog {...defaultProps} />);
    
    const rtmpUrlField = screen.getByLabelText('RTMP URL');
    const startButton = screen.getByRole('button', { name: /start stream/i });
    
    // Modify RTMP URL
    await user.clear(rtmpUrlField);
    await user.type(rtmpUrlField, 'rtmp://custom-server:1935/live/mystream');
    
    // Click start
    await user.click(startButton);
    
    await waitFor(() => {
      expect(defaultProps.onStart).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({
          rtmpUrl: 'rtmp://custom-server:1935/live/mystream',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          resolution: 'original',
          preset: 'medium'
        })
      );
    });
  });

  it('shows loading state while starting stream', async () => {
    const slowOnStart = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    render(<StreamConfigDialog {...defaultProps} onStart={slowOnStart} />);
    
    const startButton = screen.getByRole('button', { name: /start stream/i });
    
    fireEvent.click(startButton);
    
    // Should show loading state
    expect(screen.getByText('Starting...')).toBeInTheDocument();
    expect(startButton).toBeDisabled();
    
    await waitFor(() => {
      expect(slowOnStart).toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<StreamConfigDialog {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('disables Start Stream button when already streaming', () => {
    render(<StreamConfigDialog {...defaultProps} isStreaming={true} />);
    
    const startButton = screen.getByRole('button', { name: /start stream/i });
    expect(startButton).toBeDisabled();
  });

  it('handles missing file gracefully', () => {
    render(<StreamConfigDialog {...defaultProps} file={null} />);
    
    expect(screen.getByText('Configure Stream - No file selected')).toBeInTheDocument();
  });
});