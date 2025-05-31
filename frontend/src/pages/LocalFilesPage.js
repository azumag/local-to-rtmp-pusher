import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, LinearProgress } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { styled } from '@mui/material/styles';

// APIサービスのインポート
import { uploadFile, listFiles, deleteFile } from '../services/fileService';
import { startStream } from '../services/streamService';
import FileCard from '../components/FileCard';

// localStorage keys
const STORAGE_KEYS = {
  RTMP_URL: 'streamcaster_rtmp_url',
  STREAM_KEY: 'streamcaster_stream_key',
  STREAM_FORMAT: 'streamcaster_stream_format',
  VIDEO_SETTINGS: 'streamcaster_video_settings',
  AUDIO_SETTINGS: 'streamcaster_audio_settings'
};

// localStorage helper functions
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error);
    return defaultValue;
  }
};

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
  }
};

// ファイルアップロード用のスタイル付きコンポーネント
const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

function LocalFilesPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [streamFormat, setStreamFormat] = useState('rtmp');
  const [videoSettings, setVideoSettings] = useState({
    codec: 'libx264',
    bitrate: '2500k',
    framerate: 30,
    width: 1280,
    height: 720
  });
  const [audioSettings, setAudioSettings] = useState({
    codec: 'aac',
    bitrate: '128k',
    sampleRate: 44100,
    channels: 2
  });
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);

  // ファイル一覧の取得
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await listFiles();
      // レスポンスが配列であることを確認
      setFiles(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('ファイル一覧の取得に失敗しました', error);
      setFiles([]); // エラー時は空配列をセット
    } finally {
      setLoading(false);
    }
  };

  // Load saved values from localStorage on component mount
  useEffect(() => {
    const savedRtmpUrl = loadFromStorage(STORAGE_KEYS.RTMP_URL, '');
    const savedStreamKey = loadFromStorage(STORAGE_KEYS.STREAM_KEY, '');
    const savedStreamFormat = loadFromStorage(STORAGE_KEYS.STREAM_FORMAT, 'rtmp');
    const savedVideoSettings = loadFromStorage(STORAGE_KEYS.VIDEO_SETTINGS, {
      codec: 'libx264',
      bitrate: '2500k',
      framerate: 30,
      width: 1280,
      height: 720
    });
    const savedAudioSettings = loadFromStorage(STORAGE_KEYS.AUDIO_SETTINGS, {
      codec: 'aac',
      bitrate: '128k',
      sampleRate: 44100,
      channels: 2
    });

    setRtmpUrl(savedRtmpUrl);
    setStreamKey(savedStreamKey);
    setStreamFormat(savedStreamFormat);
    setVideoSettings(savedVideoSettings);
    setAudioSettings(savedAudioSettings);

    fetchFiles();
  }, []);

  // ファイルのアップロード
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await uploadFile(formData, (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(progress);
      });

      // ファイル一覧を更新
      fetchFiles();
      // 成功メッセージ
      alert(`ファイル "${file.name}" のアップロードに成功しました`);
    } catch (error) {
      console.error('ファイルのアップロードに失敗しました', error);
      // エラーメッセージをユーザーに表示
      alert(`エラー: ${error.response?.data?.error || error.message || 'ファイルのアップロードに失敗しました'}`);
    } finally {
      setUploading(false);
    }
  };

  // ファイルの削除
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('このファイルを削除してもよろしいですか？')) return;

    try {
      await deleteFile(fileId);
      // ファイル一覧を更新
      fetchFiles();
    } catch (error) {
      console.error('ファイルの削除に失敗しました', error);
    }
  };

  // ストリーミングダイアログを開く
  const handleOpenStreamDialog = (file) => {
    setSelectedFile(file);
    setStreamDialogOpen(true);
  };

  // ストリーミングの開始
  const handleStartStream = async () => {
    if (!selectedFile || !rtmpUrl) return;

    console.log('選択されたファイル:', selectedFile); // 追加：選択されたファイルの確認

    try {
      const streamData = {
        fileId: selectedFile.id,
        rtmpUrl,
        streamKey,
        format: streamFormat,
        videoSettings,
        audioSettings
      };

      console.log('ストリーム開始リクエストデータ:', streamData);

      const response = await startStream(streamData);
      console.log('ストリーミングを開始しました', response.data);
      
      // 成功した場合に設定を保存
      saveToStorage(STORAGE_KEYS.RTMP_URL, rtmpUrl);
      saveToStorage(STORAGE_KEYS.STREAM_KEY, streamKey);
      saveToStorage(STORAGE_KEYS.STREAM_FORMAT, streamFormat);
      saveToStorage(STORAGE_KEYS.VIDEO_SETTINGS, videoSettings);
      saveToStorage(STORAGE_KEYS.AUDIO_SETTINGS, audioSettings);
      
      // ダイアログを閉じる
      setStreamDialogOpen(false);
      
      // ユーザーに通知
      alert(`ストリーミングを開始しました: ${selectedFile.originalName}`);
    } catch (error) {
      console.error('ストリーミングの開始に失敗しました', error);
      alert(`エラー: ${error.response?.data?.error || error.message || 'ストリーミングの開始に失敗しました'}`);
    }
  };

  // クイックストリーミング（デフォルト設定で即座に開始）
  const handleQuickStream = async (file) => {
    // デフォルト設定が不十分な場合は通常ダイアログを開く
    if (!rtmpUrl) {
      handleOpenStreamDialog(file);
      return;
    }

    try {
      const streamData = {
        fileId: file.id,
        rtmpUrl,
        streamKey,
        format: streamFormat,
        videoSettings,
        audioSettings
      };

      const response = await startStream(streamData);
      console.log('クイックストリーミングを開始しました', response.data);
      
      // ユーザーに通知
      alert(`クイックストリーミングを開始しました: ${file.originalName}`);
    } catch (error) {
      console.error('クイックストリーミングの開始に失敗しました', error);
      alert(`エラー: ${error.response?.data?.error || error.message || 'クイックストリーミングの開始に失敗しました'}`);
    }
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        ローカルファイル
      </Typography>
      
      <Paper sx={{ p: 3, mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body1">
          動画ファイルをアップロードしてRTMP/SRTで配信することができます。
        </Typography>
        
        <Button
          component="label"
          variant="contained"
          startIcon={<CloudUploadIcon />}
          disabled={uploading}
        >
          ファイルをアップロード
          <VisuallyHiddenInput type="file" accept="video/*" onChange={handleFileUpload} />
        </Button>
      </Paper>
      
      {uploading && (
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            アップロード中... {uploadProgress}%
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={uploadProgress} 
            sx={{ height: 10, borderRadius: 5 }}
          />
          <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
            ファイルサイズによっては時間がかかる場合があります。しばらくお待ちください。
          </Typography>
        </Paper>
      )}
      
      <Typography variant="h6" gutterBottom>
        アップロード済みファイル
      </Typography>
      
      {loading ? (
        <LinearProgress />
      ) : (
        <Grid container spacing={3}>
          {files && Array.isArray(files) && files.length > 0 ? (
            files.map((file) => (
              <Grid item xs={12} sm={6} md={4} key={file.id}>
                <FileCard
                  file={{
                    ...file,
                    name: file.originalName,
                    uploadDate: file.createdAt
                  }}
                  onStream={() => handleOpenStreamDialog(file)}
                  onQuickStream={() => handleQuickStream(file)}
                  onDelete={() => handleDeleteFile(file.id)}
                  cardType="local"
                  showDelete={true}
                  showQuickStream={!!rtmpUrl}
                />
              </Grid>
            ))
          ) : (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  まだファイルがアップロードされていません。
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
      
      {/* ストリーミング設定ダイアログ */}
      <Dialog
        open={streamDialogOpen}
        onClose={() => setStreamDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>ストリーミング設定</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              {selectedFile?.originalName}
            </Typography>
            
            <TextField
              label="RTMP/SRT URL"
              fullWidth
              margin="normal"
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              required
              helperText="例: rtmp://localhost:1935/live"
            />
            
            <TextField
              label="ストリームキー"
              fullWidth
              margin="normal"
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              helperText="省略可能"
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel>ストリーム形式</InputLabel>
              <Select
                value={streamFormat}
                onChange={(e) => setStreamFormat(e.target.value)}
                label="ストリーム形式"
              >
                <MenuItem value="rtmp">RTMP</MenuItem>
                <MenuItem value="srt">SRT</MenuItem>
              </Select>
            </FormControl>
            
            <Button
              sx={{ mt: 2 }}
              size="small"
              onClick={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
            >
              {advancedSettingsOpen ? '詳細設定を隠す' : '詳細設定を表示'}
            </Button>
            
            {advancedSettingsOpen && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">映像設定</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <FormControl fullWidth margin="normal" size="small">
                      <InputLabel>コーデック</InputLabel>
                      <Select
                        value={videoSettings.codec}
                        onChange={(e) => setVideoSettings({...videoSettings, codec: e.target.value})}
                        label="コーデック"
                      >
                        <MenuItem value="libx264">H.264 (libx264)</MenuItem>
                        <MenuItem value="libx265">H.265 (libx265)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="ビットレート"
                      fullWidth
                      margin="normal"
                      size="small"
                      value={videoSettings.bitrate}
                      onChange={(e) => setVideoSettings({...videoSettings, bitrate: e.target.value})}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="フレームレート"
                      fullWidth
                      margin="normal"
                      size="small"
                      type="number"
                      value={videoSettings.framerate}
                      onChange={(e) => setVideoSettings({...videoSettings, framerate: parseInt(e.target.value)})}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth margin="normal" size="small">
                      <InputLabel>解像度</InputLabel>
                      <Select
                        value={`${videoSettings.width}x${videoSettings.height}`}
                        onChange={(e) => {
                          const [width, height] = e.target.value.split('x').map(num => parseInt(num));
                          setVideoSettings({...videoSettings, width, height});
                        }}
                        label="解像度"
                      >
                        <MenuItem value="1920x1080">1920x1080 (FHD)</MenuItem>
                        <MenuItem value="1280x720">1280x720 (HD)</MenuItem>
                        <MenuItem value="854x480">854x480 (SD)</MenuItem>
                        <MenuItem value="640x360">640x360 (LD)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                
                <Typography variant="subtitle2" sx={{ mt: 2 }}>音声設定</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <FormControl fullWidth margin="normal" size="small">
                      <InputLabel>コーデック</InputLabel>
                      <Select
                        value={audioSettings.codec}
                        onChange={(e) => setAudioSettings({...audioSettings, codec: e.target.value})}
                        label="コーデック"
                      >
                        <MenuItem value="aac">AAC</MenuItem>
                        <MenuItem value="mp3">MP3</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      label="ビットレート"
                      fullWidth
                      margin="normal"
                      size="small"
                      value={audioSettings.bitrate}
                      onChange={(e) => setAudioSettings({...audioSettings, bitrate: e.target.value})}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth margin="normal" size="small">
                      <InputLabel>サンプルレート</InputLabel>
                      <Select
                        value={audioSettings.sampleRate}
                        onChange={(e) => setAudioSettings({...audioSettings, sampleRate: parseInt(e.target.value)})}
                        label="サンプルレート"
                      >
                        <MenuItem value={48000}>48000 Hz</MenuItem>
                        <MenuItem value={44100}>44100 Hz</MenuItem>
                        <MenuItem value={22050}>22050 Hz</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth margin="normal" size="small">
                      <InputLabel>チャンネル数</InputLabel>
                      <Select
                        value={audioSettings.channels}
                        onChange={(e) => setAudioSettings({...audioSettings, channels: parseInt(e.target.value)})}
                        label="チャンネル数"
                      >
                        <MenuItem value={2}>ステレオ (2)</MenuItem>
                        <MenuItem value={1}>モノラル (1)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStreamDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleStartStream} variant="contained">ストリーミング開始</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LocalFilesPage;