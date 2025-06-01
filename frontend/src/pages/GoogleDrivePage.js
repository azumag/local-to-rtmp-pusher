import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  IconButton,
  LinearProgress,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
import { listFilesFromShareUrl, downloadFile } from '../services/googleDriveService';
import { usePersistentStreaming } from '../hooks/usePersistentStreaming';

// localStorage keys
const STORAGE_KEYS = {
  GOOGLE_DRIVE_URL: 'streamcaster_google_drive_url',
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

function GoogleDrivePage() {
  const [shareUrl, setShareUrl] = useState('');
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // 永続ストリーミング機能
  const { currentSession, canSwitchContent, switchToFile } = usePersistentStreaming();
  const [downloading, setDownloading] = useState({});

  // Load saved values from localStorage on component mount
  useEffect(() => {
    const savedShareUrl = loadFromStorage(STORAGE_KEYS.GOOGLE_DRIVE_URL, '');
    setShareUrl(savedShareUrl);
  }, []);

  // Googleドライブ共有URLからファイル一覧を取得
  const handleFetchFiles = async () => {
    if (!shareUrl.trim()) {
      alert('Google Driveの共有URLを入力してください');
      return;
    }

    setLoading(true);
    try {
      const response = await listFilesFromShareUrl(shareUrl);
      console.log('API response:', response);

      // レスポンスデータの確認
      const filesData = response.data || response;
      console.log('Files data:', filesData);

      if (Array.isArray(filesData)) {
        setFiles(filesData);
      } else {
        console.error('Unexpected response format:', filesData);
        setFiles([]);
      }

      // 成功した場合にURLを保存
      saveToStorage(STORAGE_KEYS.GOOGLE_DRIVE_URL, shareUrl);
    } catch (error) {
      console.error('ファイル一覧の取得に失敗しました', error);
      const errorMessage =
        error.response?.data?.error || error.message || 'ファイル一覧の取得に失敗しました';
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      alert(`エラー: ${errorMessage}`);
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
      alert(
        `エラー: ${error.response?.data?.error || error.message || 'ファイルのダウンロードに失敗しました'}`
      );
    } finally {
      setDownloading({ ...downloading, [file.id]: false });
    }
  };

  // 通知表示用の関数
  const showNotification = (message, severity = 'info') => {
    setNotification({ open: true, message, severity });
  };

  const hideNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // 永続ストリーミングセッションにファイルを送信
  const handleSendToStream = async (file) => {
    if (!currentSession) {
      showNotification('アクティブなストリーミングセッションがありません', 'warning');
      return;
    }

    try {
      await switchToFile(currentSession.id, file.id, true); // Google Driveファイルなのでtrue
      showNotification(`ファイルを配信に送信しました: ${file.name}`, 'success');
    } catch (error) {
      console.error('ファイル送信に失敗しました', error);
      showNotification(`エラー: ${error.message || 'ファイル送信に失敗しました'}`, 'error');
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
                    image={`https://drive.google.com/thumbnail?id=${file.id}&sz=w320-h180-c`}
                    alt={file.name}
                    onError={(e) => {
                      e.target.src = '/video-thumbnail.png';
                    }}
                  />
                  <CardContent>
                    <Typography variant="h6" component="div" noWrap title={file.name}>
                      {file.name}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<SendToMobileIcon />}
                        onClick={() => handleSendToStream(file)}
                        disabled={!canSwitchContent}
                        title={!canSwitchContent ? 'アクティブなセッションがありません' : ''}
                      >
                        配信に送る
                      </Button>
                    </Box>
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

      {/* 通知用のSnackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={hideNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={hideNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default GoogleDrivePage;
