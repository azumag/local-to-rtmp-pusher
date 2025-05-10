import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, FormControl, InputLabel, Select, MenuItem, Snackbar, Alert, Divider, Switch, FormControlLabel } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import { getRtmpServerInfo } from '../services/streamService';

// ローカルストレージのキー
const SETTINGS_STORAGE_KEY = 'local-to-rtmp-pusher-settings';

// デフォルト設定
const defaultSettings = {
  rtmpServer: {
    url: 'rtmp://localhost:1935/live',
    key: '',
  },
  video: {
    codec: 'libx264',
    bitrate: '2500k',
    framerate: 30,
    width: 1280,
    height: 720,
  },
  audio: {
    codec: 'aac',
    bitrate: '128k',
    sampleRate: 44100,
    channels: 2,
  },
  general: {
    defaultFormat: 'rtmp',
    useInternalRtmpServer: true,
    autoStartStreaming: false,
  }
};

function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // 設定をロード
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      } catch (error) {
        console.error('設定の読み込みに失敗しました', error);
        showAlert('設定の読み込みに失敗しました', 'error');
      }
    };

    loadSettings();
    fetchServerInfo();
  }, []);

  // RTMPサーバー情報を取得
  const fetchServerInfo = async () => {
    setLoading(true);
    try {
      const response = await getRtmpServerInfo();
      setServerInfo(response.data);
    } catch (error) {
      console.error('サーバー情報の取得に失敗しました', error);
    } finally {
      setLoading(false);
    }
  };

  // 設定を保存
  const handleSaveSettings = () => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      showAlert('設定を保存しました', 'success');
    } catch (error) {
      console.error('設定の保存に失敗しました', error);
      showAlert('設定の保存に失敗しました', 'error');
    }
  };

  // 設定をリセット
  const handleResetSettings = () => {
    if (!window.confirm('設定をデフォルトに戻してもよろしいですか？')) return;
    
    setSettings(defaultSettings);
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
      showAlert('設定をリセットしました', 'info');
    } catch (error) {
      console.error('設定のリセットに失敗しました', error);
      showAlert('設定のリセットに失敗しました', 'error');
    }
  };

  // アラートを表示
  const showAlert = (message, severity = 'info') => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
  };

  // 設定の変更処理
  const handleSettingChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  // 解像度変更のハンドラ
  const handleResolutionChange = (resolutionString) => {
    const [width, height] = resolutionString.split('x').map(num => parseInt(num));
    setSettings(prev => ({
      ...prev,
      video: {
        ...prev.video,
        width,
        height
      }
    }));
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        設定
      </Typography>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" component="h2">
            一般設定
          </Typography>
          <Box>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              onClick={handleResetSettings}
              sx={{ mr: 1 }}
            >
              リセット
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveSettings}
            >
              保存
            </Button>
          </Box>
        </Box>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>デフォルトストリーム形式</InputLabel>
              <Select
                value={settings.general.defaultFormat}
                onChange={(e) => handleSettingChange('general', 'defaultFormat', e.target.value)}
                label="デフォルトストリーム形式"
              >
                <MenuItem value="rtmp">RTMP</MenuItem>
                <MenuItem value="srt">SRT</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.general.useInternalRtmpServer}
                  onChange={(e) => handleSettingChange('general', 'useInternalRtmpServer', e.target.checked)}
                  color="primary"
                />
              }
              label="内蔵RTMPサーバーを使用"
              sx={{ mt: 2 }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.general.autoStartStreaming}
                  onChange={(e) => handleSettingChange('general', 'autoStartStreaming', e.target.checked)}
                  color="primary"
                />
              }
              label="ファイル選択時に自動的にストリーミングを開始"
              sx={{ mt: 2 }}
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          RTMPサーバー設定
        </Typography>
        
        {serverInfo && (
          <Alert severity="info" sx={{ mb: 2 }}>
            内蔵RTMPサーバーが利用可能です: {serverInfo.defaultServer}
          </Alert>
        )}
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <TextField
              label="デフォルトRTMP URL"
              fullWidth
              value={settings.rtmpServer.url}
              onChange={(e) => handleSettingChange('rtmpServer', 'url', e.target.value)}
              margin="normal"
              helperText="例: rtmp://localhost:1935/live"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="デフォルトストリームキー"
              fullWidth
              value={settings.rtmpServer.key}
              onChange={(e) => handleSettingChange('rtmpServer', 'key', e.target.value)}
              margin="normal"
              helperText="省略可能"
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          デフォルト動画設定
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>コーデック</InputLabel>
              <Select
                value={settings.video.codec}
                onChange={(e) => handleSettingChange('video', 'codec', e.target.value)}
                label="コーデック"
              >
                <MenuItem value="libx264">H.264 (libx264)</MenuItem>
                <MenuItem value="libx265">H.265 (libx265)</MenuItem>
                <MenuItem value="copy">コピー (再エンコードなし)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label="ビットレート"
              fullWidth
              value={settings.video.bitrate}
              onChange={(e) => handleSettingChange('video', 'bitrate', e.target.value)}
              margin="normal"
              helperText="例: 2500k, 3M"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label="フレームレート"
              fullWidth
              type="number"
              value={settings.video.framerate}
              onChange={(e) => handleSettingChange('video', 'framerate', parseInt(e.target.value))}
              margin="normal"
              InputProps={{ inputProps: { min: 1, max: 120 } }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>解像度</InputLabel>
              <Select
                value={`${settings.video.width}x${settings.video.height}`}
                onChange={(e) => handleResolutionChange(e.target.value)}
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
      </Paper>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          デフォルト音声設定
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>コーデック</InputLabel>
              <Select
                value={settings.audio.codec}
                onChange={(e) => handleSettingChange('audio', 'codec', e.target.value)}
                label="コーデック"
              >
                <MenuItem value="aac">AAC</MenuItem>
                <MenuItem value="mp3">MP3</MenuItem>
                <MenuItem value="copy">コピー (再エンコードなし)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label="ビットレート"
              fullWidth
              value={settings.audio.bitrate}
              onChange={(e) => handleSettingChange('audio', 'bitrate', e.target.value)}
              margin="normal"
              helperText="例: 128k, 192k"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>サンプルレート</InputLabel>
              <Select
                value={settings.audio.sampleRate}
                onChange={(e) => handleSettingChange('audio', 'sampleRate', parseInt(e.target.value))}
                label="サンプルレート"
              >
                <MenuItem value={48000}>48000 Hz</MenuItem>
                <MenuItem value={44100}>44100 Hz</MenuItem>
                <MenuItem value={22050}>22050 Hz</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>チャンネル数</InputLabel>
              <Select
                value={settings.audio.channels}
                onChange={(e) => handleSettingChange('audio', 'channels', parseInt(e.target.value))}
                label="チャンネル数"
              >
                <MenuItem value={2}>ステレオ (2)</MenuItem>
                <MenuItem value={1}>モノラル (1)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>
      
      {/* アラート */}
      <Snackbar
        open={alertOpen}
        autoHideDuration={6000}
        onClose={() => setAlertOpen(false)}
      >
        <Alert
          onClose={() => setAlertOpen(false)}
          severity={alertSeverity}
          sx={{ width: '100%' }}
        >
          {alertMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SettingsPage;