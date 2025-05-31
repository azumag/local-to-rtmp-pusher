import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Button, 
  Grid, 
  Paper,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  CircularProgress
} from '@mui/material';
import StreamIcon from '@mui/icons-material/Stream';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import FolderIcon from '@mui/icons-material/Folder';
import { listFiles, deleteFile } from '../services/fileService';
import useStreaming from '../hooks/useStreaming';

function HomePage() {
  const navigate = useNavigate();
  const { activeStreams, isLoading: streamsLoading } = useStreaming();
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [googleDriveStatus, setGoogleDriveStatus] = useState({ connected: false, accountInfo: null });

  useEffect(() => {
    fetchFiles();
    checkGoogleDriveStatus();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await listFiles();
      setFiles(response.data.slice(0, 5)); // 最新5件のみ表示
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setFilesLoading(false);
    }
  };

  const checkGoogleDriveStatus = () => {
    // 実際のGoogle Drive接続状態をチェックするロジックを実装
    // 今回は仮の状態を設定
    setGoogleDriveStatus({
      connected: false,
      accountInfo: null,
      lastSync: null
    });
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteFile(fileId);
      await fetchFiles(); // ファイル一覧を再取得
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ja-JP');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* ヘッダーセクション */}
      <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          StreamCaster ダッシュボード
        </Typography>
        <Typography variant="body1">
          ストリーミング状況、ファイル、接続状態を一目で確認できます。
        </Typography>
      </Paper>

      <Grid container spacing={3}>
        {/* ストリーム状況セクション */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <StreamIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6" component="h2">
                  ストリーム状況
                </Typography>
              </Box>
              
              {streamsLoading ? (
                <CircularProgress />
              ) : (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Chip 
                      label={activeStreams.length > 0 ? '配信中' : '停止中'}
                      color={activeStreams.length > 0 ? 'success' : 'default'}
                      icon={activeStreams.length > 0 ? <PlayArrowIcon /> : <StopIcon />}
                      sx={{ mr: 2 }}
                    />
                    <Typography variant="body2">
                      アクティブなストリーム: {activeStreams.length}件
                    </Typography>
                  </Box>
                  
                  {activeStreams.length > 0 && (
                    <List dense>
                      {activeStreams.slice(0, 3).map((stream, index) => (
                        <ListItem key={index}>
                          <ListItemText 
                            primary={stream.fileName || `ストリーム ${index + 1}`}
                            secondary={`${stream.rtmpUrl || 'N/A'}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                  
                  <Box sx={{ mt: 2 }}>
                    <Button 
                      variant="outlined" 
                      onClick={() => navigate('/streams')}
                      fullWidth
                    >
                      ストリーム管理を開く
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Google Drive接続状態セクション */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {googleDriveStatus.connected ? (
                  <CloudDoneIcon sx={{ mr: 1, color: 'success.main' }} />
                ) : (
                  <CloudOffIcon sx={{ mr: 1, color: 'error.main' }} />
                )}
                <Typography variant="h6" component="h2">
                  Google Drive
                </Typography>
              </Box>
              
              {googleDriveStatus.connected ? (
                <Box>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    接続済み
                  </Alert>
                  {googleDriveStatus.accountInfo && (
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      アカウント: {googleDriveStatus.accountInfo.email}
                    </Typography>
                  )}
                  {googleDriveStatus.lastSync && (
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      最終同期: {formatDate(googleDriveStatus.lastSync)}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  未接続
                </Alert>
              )}
              
              <Button 
                variant="outlined" 
                onClick={() => navigate('/google-drive')}
                fullWidth
              >
                Google Driveを管理
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* アップロード済みファイルセクション */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6" component="h2">
                  最近のファイル
                </Typography>
              </Box>
              
              {filesLoading ? (
                <CircularProgress />
              ) : files.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  アップロードされたファイルがありません
                </Typography>
              ) : (
                <List>
                  {files.map((file) => (
                    <ListItem key={file.id}>
                      <ListItemText 
                        primary={file.originalName}
                        secondary={`${formatFileSize(file.size)} • ${formatDate(file.uploadedAt)}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          onClick={() => handleDeleteFile(file.id)}
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
              
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  onClick={() => navigate('/local-files')}
                  sx={{ flex: 1 }}
                >
                  すべてのファイルを見る
                </Button>
                <Button 
                  variant="contained" 
                  onClick={() => navigate('/local-files')}
                  sx={{ flex: 1 }}
                >
                  ファイルをアップロード
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default HomePage;