import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, Card, CardContent, CardMedia, CardActions, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, LinearProgress, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { listFilesFromShareUrl, downloadFile, streamFile } from '../services/googleDriveService';

function GoogleDrivePage() {
  const [shareUrl, setShareUrl] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
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
  const [downloading, setDownloading] = useState({});

  // Googleドライブ共有URLからファイル一覧を取得
  const handleFetchFiles = async () => {
    if (!shareUrl.trim()) {
      alert('Google Driveの共有URLを入力してください');
      return;
    }

    setLoading(true);
    try {
      const response = await listFilesFromShareUrl(shareUrl);
      setFiles(response.data);
    } catch (error) {
      console.error('ファイル一覧の取得に失敗しました', error);
      alert(`エラー: ${error.response?.data?.error || error.message || 'ファイル一覧の取得に失敗しました'}`);
    } finally {
      setLoading(false);
    }
  };

  // ファイルのダウンロード
  const handleDownloadFile = async (file) => {
    if (!file || !file.id) return;

    setDownloading({ ...downloading, [file.id]: true });
    try {
      const response = await downloadFile(file.id);
      alert(`ダウンロードを開始しました: ${file.name}`);
      console.log('ダウンロード情報:', response.data);
    } catch (error) {
      console.error('ファイルのダウンロードに失敗しました', error);
      alert(`エラー: ${error.response?.data?.error || error.message || 'ファイルのダウンロードに失敗しました'}`);
    } finally {
      setDownloading({ ...downloading, [file.id]: false });
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

    try {
      const streamData = {
        fileId: selectedFile.id,
        rtmpUrl,
        streamKey,
        format: streamFormat,
        videoSettings,
        audioSettings
      };

      const response = await streamFile(streamData);
      console.log('ストリーミングを開始しました', response.data);
      
      // ダイアログを閉じる
      setStreamDialogOpen(false);
      
      // ユーザーに通知
      alert(`ストリーミングを開始しました: ${selectedFile.name}`);
    } catch (error) {
      console.error('ストリーミングの開始に失敗しました', error);
      alert(`エラー: ${error.response?.data?.error || error.message || 'ストリーミングの開始に失敗しました'}`);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Googleドライブ
      </Typography>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="body1" paragraph>
          Googleドライブの共有URLを入力して、動画ファイルをRTMP/SRTで配信することができます。
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <TextField
            label="Google Drive共有URL"
            variant="outlined"
            fullWidth
            value={shareUrl}
            onChange={(e) => setShareUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            helperText="共有設定が「リンクを知っている全ユーザー」になっていることを確認してください"
          />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleFetchFiles}
            disabled={loading}
            sx={{ minWidth: '120px', height: '56px' }}
          >
            {loading ? <CircularProgress size={24} /> : '検索'}
          </Button>
        </Box>
      </Paper>
      
      <Typography variant="h6" gutterBottom>
        ファイル一覧
      </Typography>
      
      {loading ? (
        <LinearProgress />
      ) : (
        <Grid container spacing={3}>
          {files.length === 0 ? (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  ファイルがありません。共有URLを入力して検索してください。
                </Typography>
              </Paper>
            </Grid>
          ) : (
            files.map((file) => (
              <Grid item xs={12} sm={6} md={4} key={file.id}>
                <Card>
                  <CardMedia
                    component="img"
                    height="140"
                    image="/video-thumbnail.png"
                    alt={file.name}
                  />
                  <CardContent>
                    <Typography variant="h6" component="div" noWrap title={file.name}>
                      {file.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      タイプ: {file.mimeType}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleOpenStreamDialog(file)}
                    >
                      ストリーム
                    </Button>
                    <IconButton
                      color="primary"
                      size="small"
                      onClick={() => handleDownloadFile(file)}
                      disabled={downloading[file.id]}
                    >
                      {downloading[file.id] ? <CircularProgress size={24} /> : <DownloadIcon />}
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))
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
              {selectedFile?.name}
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

export default GoogleDrivePage;