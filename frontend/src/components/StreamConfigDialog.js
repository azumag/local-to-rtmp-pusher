import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  CircularProgress,
  Alert
} from '@mui/material';

const STREAM_DEFAULTS = {
  rtmpUrl: 'rtmp://localhost:1935/live/stream',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  videoBitrate: '2000k',
  audioBitrate: '128k',
  resolution: 'original',
  preset: 'medium'
};

const VIDEO_CODECS = [
  { value: 'libx264', label: 'H.264' },
  { value: 'libx265', label: 'H.265/HEVC' },
  { value: 'copy', label: 'Copy (No re-encoding)' }
];

const AUDIO_CODECS = [
  { value: 'aac', label: 'AAC' },
  { value: 'mp3', label: 'MP3' },
  { value: 'copy', label: 'Copy (No re-encoding)' }
];

const RESOLUTIONS = [
  { value: 'original', label: 'Original' },
  { value: '1920x1080', label: '1080p (1920x1080)' },
  { value: '1280x720', label: '720p (1280x720)' },
  { value: '854x480', label: '480p (854x480)' }
];

const PRESETS = [
  { value: 'ultrafast', label: 'Ultra Fast' },
  { value: 'superfast', label: 'Super Fast' },
  { value: 'veryfast', label: 'Very Fast' },
  { value: 'faster', label: 'Faster' },
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium (Balanced)' },
  { value: 'slow', label: 'Slow (Better Quality)' },
  { value: 'veryslow', label: 'Very Slow (Best Quality)' }
];

const StreamConfigDialog = ({ 
  open, 
  onClose, 
  onStart, 
  file,
  isStreaming = false,
  streamError = null
}) => {
  const [streamSettings, setStreamSettings] = useState(STREAM_DEFAULTS);
  const [isStarting, setIsStarting] = useState(false);

  const handleSettingChange = (field) => (event) => {
    setStreamSettings({
      ...streamSettings,
      [field]: event.target.value
    });
  };

  const handleStartStream = async () => {
    if (!file) return;
    
    setIsStarting(true);
    try {
      await onStart(file, streamSettings);
      onClose();
    } catch (error) {
      // Error is handled by parent component
    } finally {
      setIsStarting(false);
    }
  };

  const isFormValid = streamSettings.rtmpUrl && 
    streamSettings.rtmpUrl.startsWith('rtmp://');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Configure Stream - {file?.name || 'No file selected'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {streamError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {streamError}
            </Alert>
          )}

          <TextField
            fullWidth
            label="RTMP URL"
            value={streamSettings.rtmpUrl}
            onChange={handleSettingChange('rtmpUrl')}
            placeholder="rtmp://server:port/app/stream"
            helperText="Enter the RTMP server URL where you want to stream"
            error={!streamSettings.rtmpUrl || !streamSettings.rtmpUrl.startsWith('rtmp://')}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Video Codec</InputLabel>
              <Select
                value={streamSettings.videoCodec}
                onChange={handleSettingChange('videoCodec')}
                label="Video Codec"
              >
                {VIDEO_CODECS.map(codec => (
                  <MenuItem key={codec.value} value={codec.value}>
                    {codec.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Audio Codec</InputLabel>
              <Select
                value={streamSettings.audioCodec}
                onChange={handleSettingChange('audioCodec')}
                label="Audio Codec"
              >
                {AUDIO_CODECS.map(codec => (
                  <MenuItem key={codec.value} value={codec.value}>
                    {codec.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Video Bitrate"
              value={streamSettings.videoBitrate}
              onChange={handleSettingChange('videoBitrate')}
              placeholder="2000k"
              helperText="e.g., 2000k, 4M"
              disabled={streamSettings.videoCodec === 'copy'}
            />

            <TextField
              fullWidth
              label="Audio Bitrate"
              value={streamSettings.audioBitrate}
              onChange={handleSettingChange('audioBitrate')}
              placeholder="128k"
              helperText="e.g., 128k, 256k"
              disabled={streamSettings.audioCodec === 'copy'}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Resolution</InputLabel>
              <Select
                value={streamSettings.resolution}
                onChange={handleSettingChange('resolution')}
                label="Resolution"
                disabled={streamSettings.videoCodec === 'copy'}
              >
                {RESOLUTIONS.map(res => (
                  <MenuItem key={res.value} value={res.value}>
                    {res.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Encoding Preset</InputLabel>
              <Select
                value={streamSettings.preset}
                onChange={handleSettingChange('preset')}
                label="Encoding Preset"
                disabled={streamSettings.videoCodec === 'copy'}
              >
                {PRESETS.map(preset => (
                  <MenuItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Note: Using 'copy' for codecs will preserve the original quality but may not be compatible with all streaming platforms.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isStarting}>
          Cancel
        </Button>
        <Button
          onClick={handleStartStream}
          variant="contained"
          disabled={!isFormValid || isStarting || isStreaming}
          startIcon={isStarting ? <CircularProgress size={20} /> : null}
        >
          {isStarting ? 'Starting...' : 'Start Stream'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StreamConfigDialog;