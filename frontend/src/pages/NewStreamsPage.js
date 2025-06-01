import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  LinearProgress,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Upload as UploadIcon,
  Settings as SettingsIcon,
  PhotoCamera as PhotoCameraIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { usePersistentStreaming } from '../hooks/usePersistentStreaming';

function NewStreamsPage() {
  const {
    activeSessions,
    currentSession,
    sessionStatus,
    isLoading,
    error,
    rtmpConfig,
    startSession,
    stopSession,
    switchToStandby,
    uploadStandbyImage,
    saveRtmpConfig,
    selectSession,
    clearError,
    fetchActiveSessions,
    SESSION_STATE_LABELS,
    canSwitchContent,
    isConnecting,
  } = usePersistentStreaming();

  // UI状態
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [localConfig, setLocalConfig] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');
  const [standbyImageFile, setStandbyImageFile] = useState(null);
  const [standbyImagePreview, setStandbyImagePreview] = useState(null);

  // エラー表示
  React.useEffect(() => {
    if (error) {
      showAlert(error, 'error');
      clearError();
    }
  }, [error, clearError]);

  // RTMP設定の初期化と下位互換性のためのマイグレーション
  React.useEffect(() => {
    if (rtmpConfig && !localConfig) {
      // 下位互換性のためにエンドポイントに新しいフィールドを追加
      const migratedConfig = {
        ...rtmpConfig,
        endpoints: rtmpConfig.endpoints.map(endpoint => ({
          ...endpoint,
          // 既存の設定になければ新しいフィールドを追加
          videoSettings: endpoint.videoSettings || null,
          audioSettings: endpoint.audioSettings || null,
        }))
      };
      setLocalConfig(migratedConfig);
    }
  }, [rtmpConfig, localConfig]);

  const showAlert = (message, severity = 'info') => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
  };

  // セッション開始
  const handleStartSession = async () => {
    if (!localConfig) {
      showAlert('RTMP設定を先に保存してください', 'warning');
      return;
    }

    const activeEndpoints = localConfig.endpoints.filter((ep) => ep.enabled);
    if (activeEndpoints.length === 0) {
      showAlert('少なくとも1つのRTMPエンドポイントを有効にしてください', 'warning');
      return;
    }

    try {
      // 静止画ファイルがある場合は先にアップロード
      let standbyImagePath = null;
      if (standbyImageFile) {
        const formData = new FormData();
        formData.append('image', standbyImageFile);
        
        // 一時的な静止画アップロード
        const uploadResponse = await fetch('/api/stream/content/upload-temp', {
          method: 'POST',
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          standbyImagePath = uploadResult.path;
        }
      }

      await startSession({
        endpoints: activeEndpoints,
        videoSettings: localConfig.videoSettings,
        audioSettings: localConfig.audioSettings,
        sessionName: `配信セッション ${new Date().toLocaleString()}`,
        standbyImage: standbyImagePath,
      });
      showAlert('配信セッションを開始しました', 'success');
      
      // セッション開始後、静止画設定をクリア
      setStandbyImageFile(null);
      setStandbyImagePreview(null);
    } catch (err) {
      showAlert(`セッション開始に失敗しました: ${err.message}`, 'error');
    }
  };

  // セッション停止
  const handleStopSession = async () => {
    if (!currentSession) return;

    try {
      await stopSession(currentSession.id);
      showAlert('配信セッションを停止しました', 'success');
    } catch (err) {
      showAlert(`セッション停止に失敗しました: ${err.message}`, 'error');
    }
  };

  // 静止画に切り替え
  const handleSwitchToStandby = async () => {
    if (!currentSession) return;

    try {
      await switchToStandby(currentSession.id);
      showAlert('静止画に切り替えました', 'success');
    } catch (err) {
      showAlert(`静止画への切り替えに失敗しました: ${err.message}`, 'error');
    }
  };

  // RTMP設定保存
  const handleSaveConfig = async () => {
    try {
      await saveRtmpConfig(localConfig);
      setConfigDialogOpen(false);
      showAlert('RTMP設定を保存しました', 'success');
    } catch (err) {
      showAlert(`設定の保存に失敗しました: ${err.message}`, 'error');
    }
  };

  // 静止画アップロード
  const handleUploadStandbyImage = async () => {
    if (!currentSession || !selectedFile) return;

    try {
      await uploadStandbyImage(currentSession.id, selectedFile);
      setUploadDialogOpen(false);
      setSelectedFile(null);
      showAlert('静止画をアップロードしました', 'success');
    } catch (err) {
      showAlert(`アップロードに失敗しました: ${err.message}`, 'error');
    }
  };

  // エンドポイント設定の更新
  const updateEndpoint = (index, field, value) => {
    const newConfig = { ...localConfig };
    newConfig.endpoints[index][field] = value;
    setLocalConfig(newConfig);
  };

  // エンドポイント固有のエンコーディング設定を更新
  const updateEndpointEncoding = (index, category, field, value) => {
    const newConfig = { ...localConfig };
    if (!newConfig.endpoints[index][category]) {
      newConfig.endpoints[index][category] = {};
    }
    newConfig.endpoints[index][category][field] = value;
    setLocalConfig(newConfig);
  };

  // エンドポイント固有のエンコーディング設定をクリア（グローバル設定を使用）
  const clearEndpointEncoding = (index, category) => {
    const newConfig = { ...localConfig };
    newConfig.endpoints[index][category] = null;
    setLocalConfig(newConfig);
  };

  // 設定値の更新
  const updateSettings = (category, field, value) => {
    const newConfig = { ...localConfig };
    newConfig[category][field] = value;
    setLocalConfig(newConfig);
  };

  // 静止画ファイルの処理
  const handleStandbyImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setStandbyImageFile(file);
      
      // プレビュー用のURLを作成
      const reader = new FileReader();
      reader.onloadend = () => {
        setStandbyImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 静止画をクリア
  const clearStandbyImage = () => {
    setStandbyImageFile(null);
    setStandbyImagePreview(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
      case 'streaming':
        return 'success';
      case 'connecting':
      case 'reconnecting':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          永続ストリーミング
        </Typography>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchActiveSessions}
            disabled={isLoading}
          >
            更新
          </Button>

          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setConfigDialogOpen(true)}
          >
            RTMP設定
          </Button>
        </Box>
      </Box>

      {/* 説明 */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="body1">
          永続的なRTMPストリーミングセッションを管理します。セッションを開始すると、
          静止画での配信が始まり、ファイルの切り替えが可能になります。
        </Typography>
      </Paper>

      {/* 静止画設定パネル */}
      {!currentSession && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            デフォルト静止画設定
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            セッション開始時に使用する静止画を設定できます。設定しない場合はデフォルトの静止画が使用されます。
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<PhotoCameraIcon />}
            >
              静止画を選択
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={handleStandbyImageChange}
              />
            </Button>
            
            {standbyImageFile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  {standbyImageFile.name}
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={clearStandbyImage}
                >
                  削除
                </Button>
              </Box>
            )}
          </Box>
          
          {standbyImagePreview && (
            <Box sx={{ mt: 2, maxWidth: 300 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                プレビュー:
              </Typography>
              <img
                src={standbyImagePreview}
                alt="静止画プレビュー"
                style={{
                  width: '100%',
                  height: 'auto',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                }}
              />
            </Box>
          )}
        </Paper>
      )}

      <Grid container spacing={3}>
        {/* セッション制御パネル */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                セッション制御
              </Typography>

              {currentSession ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ mr: 2 }}>
                      {currentSession.name || 'セッション'}
                    </Typography>
                    <Chip
                      label={SESSION_STATE_LABELS[sessionStatus?.status] || 'Unknown'}
                      color={getStatusColor(sessionStatus?.status)}
                      size="small"
                    />
                    {sessionStatus?.isStandbyImage && (
                      <Chip
                        icon={<ImageIcon />}
                        label="静止画"
                        size="small"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>

                  {sessionStatus && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        配信時間: {Math.floor((sessionStatus.uptime || 0) / 60)}分
                      </Typography>
                      {sessionStatus.reconnectAttempts > 0 && (
                        <Typography variant="body2" color="warning.main">
                          再接続試行: {sessionStatus.reconnectAttempts}回
                        </Typography>
                      )}
                    </Box>
                  )}

                  {isConnecting && <LinearProgress sx={{ mb: 2 }} />}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  セッションが開始されていません
                </Typography>
              )}
            </CardContent>

            <CardActions>
              {currentSession ? (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStopSession}
                  disabled={isLoading}
                >
                  セッション停止
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrowIcon />}
                  onClick={handleStartSession}
                  disabled={isLoading || !localConfig}
                >
                  セッション開始
                </Button>
              )}
            </CardActions>
          </Card>
        </Grid>

        {/* コンテンツ制御パネル */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                コンテンツ制御
              </Typography>

              {canSwitchContent ? (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    現在のコンテンツ: {sessionStatus?.isStandbyImage ? '静止画' : 'ファイル'}
                  </Typography>
                  
                  {sessionStatus?.isStandbyImage && sessionStatus?.standbyImageName && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        静止画: {sessionStatus.standbyImageName}
                      </Typography>
                      {currentSession && (
                        <Box sx={{ mt: 1, p: 1, border: '1px solid #ddd', borderRadius: 1, maxWidth: 200 }}>
                          <img
                            src={`/api/stream/standby/${currentSession.id}`}
                            alt="現在の静止画"
                            style={{
                              width: '100%',
                              height: 'auto',
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </Box>
                      )}
                    </Box>
                  )}

                  <Alert severity="info" sx={{ mb: 2 }}>
                    ファイルページでファイルを選択して配信に送ることができます
                  </Alert>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  セッションを開始してください
                </Typography>
              )}
            </CardContent>

            <CardActions>
              <Button
                startIcon={<PhotoCameraIcon />}
                onClick={handleSwitchToStandby}
                disabled={!canSwitchContent || isLoading}
              >
                静止画に戻る
              </Button>

              <Button
                startIcon={<UploadIcon />}
                onClick={() => setUploadDialogOpen(true)}
                disabled={!currentSession || isLoading}
              >
                静止画変更
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* アクティブセッション一覧 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                アクティブセッション ({activeSessions.length})
              </Typography>

              {activeSessions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  アクティブなセッションはありません
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {activeSessions.map((session) => (
                    <Grid item xs={12} sm={6} md={4} key={session.id}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          border: currentSession?.id === session.id ? '2px solid' : '1px solid',
                          borderColor:
                            currentSession?.id === session.id ? 'primary.main' : 'divider',
                        }}
                        onClick={() => selectSession(session)}
                      >
                        <Typography variant="subtitle2" noWrap>
                          セッション {session.id.slice(-8)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          エンドポイント: {session.endpoints?.length || 0}個
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          開始: {new Date(session.startTime).toLocaleTimeString()}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* RTMP設定ダイアログ */}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>RTMP設定</DialogTitle>
        <DialogContent>
          {localConfig && (
            <Box sx={{ mt: 2 }}>
              {/* エンドポイント設定 */}
              <Typography variant="h6" gutterBottom>
                RTMPエンドポイント
              </Typography>

              {localConfig.endpoints.map((endpoint, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={endpoint.enabled}
                          onChange={(e) => updateEndpoint(index, 'enabled', e.target.checked)}
                        />
                      }
                      label={`エンドポイント ${index + 1}`}
                    />
                  </Box>

                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="RTMP URL"
                        value={endpoint.url}
                        onChange={(e) => updateEndpoint(index, 'url', e.target.value)}
                        placeholder="rtmp://live.example.com/live"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="ストリームキー"
                        value={endpoint.streamKey}
                        onChange={(e) => updateEndpoint(index, 'streamKey', e.target.value)}
                        type="password"
                      />
                    </Grid>
                  </Grid>

                  {/* エンドポイント固有のエンコーディング設定 */}
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2" component="div">
                        個別エンコーディング設定 
                        {(endpoint.videoSettings || endpoint.audioSettings) && (
                          <Chip size="small" color="primary" label="カスタム" sx={{ ml: 1 }} />
                        )}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        このエンドポイント専用の設定を指定できます。未設定の場合はグローバル設定が適用されます。
                      </Typography>

                      {/* ビデオ設定 */}
                      <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle2">ビデオ設定</Typography>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={!!endpoint.videoSettings}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    updateEndpointEncoding(index, 'videoSettings', 'bitrate', '2500k');
                                  } else {
                                    clearEndpointEncoding(index, 'videoSettings');
                                  }
                                }}
                              />
                            }
                            label="個別設定を使用"
                            sx={{ ml: 'auto' }}
                          />
                        </Box>
                        {endpoint.videoSettings && (
                          <Grid container spacing={2}>
                            <Grid item xs={6} sm={3}>
                              <TextField
                                fullWidth
                                label="ビットレート"
                                value={endpoint.videoSettings.bitrate || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'videoSettings', 'bitrate', e.target.value)}
                                placeholder="2500k"
                                size="small"
                              />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <TextField
                                fullWidth
                                label="FPS"
                                type="number"
                                value={endpoint.videoSettings.fps || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'videoSettings', 'fps', parseInt(e.target.value))}
                                placeholder="30"
                                size="small"
                              />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <TextField
                                fullWidth
                                label="幅"
                                type="number"
                                value={endpoint.videoSettings.width || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'videoSettings', 'width', parseInt(e.target.value))}
                                placeholder="1920"
                                size="small"
                              />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <TextField
                                fullWidth
                                label="高さ"
                                type="number"
                                value={endpoint.videoSettings.height || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'videoSettings', 'height', parseInt(e.target.value))}
                                placeholder="1080"
                                size="small"
                              />
                            </Grid>
                          </Grid>
                        )}
                      </Box>

                      {/* オーディオ設定 */}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle2">オーディオ設定</Typography>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={!!endpoint.audioSettings}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    updateEndpointEncoding(index, 'audioSettings', 'bitrate', '128k');
                                  } else {
                                    clearEndpointEncoding(index, 'audioSettings');
                                  }
                                }}
                              />
                            }
                            label="個別設定を使用"
                            sx={{ ml: 'auto' }}
                          />
                        </Box>
                        {endpoint.audioSettings && (
                          <Grid container spacing={2}>
                            <Grid item xs={6} sm={4}>
                              <TextField
                                fullWidth
                                label="ビットレート"
                                value={endpoint.audioSettings.bitrate || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'audioSettings', 'bitrate', e.target.value)}
                                placeholder="128k"
                                size="small"
                              />
                            </Grid>
                            <Grid item xs={6} sm={4}>
                              <TextField
                                fullWidth
                                label="サンプルレート"
                                type="number"
                                value={endpoint.audioSettings.sampleRate || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'audioSettings', 'sampleRate', parseInt(e.target.value))}
                                placeholder="44100"
                                size="small"
                              />
                            </Grid>
                            <Grid item xs={6} sm={4}>
                              <TextField
                                fullWidth
                                label="チャンネル"
                                type="number"
                                value={endpoint.audioSettings.channels || ''}
                                onChange={(e) => updateEndpointEncoding(index, 'audioSettings', 'channels', parseInt(e.target.value))}
                                placeholder="2"
                                size="small"
                              />
                            </Grid>
                          </Grid>
                        )}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Paper>
              ))}

              <Divider sx={{ my: 3 }} />

              {/* グローバル設定（デフォルト設定） */}
              <Typography variant="h6" gutterBottom>
                グローバル設定（デフォルト）
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                これらの設定は全エンドポイントのデフォルトとして使用されます。個別設定が指定されていないエンドポイントに適用されます。
              </Typography>

              {/* ビデオ設定 */}
              <Typography variant="subtitle1" gutterBottom>
                ビデオ設定
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    label="ビットレート"
                    value={localConfig.videoSettings.bitrate}
                    onChange={(e) => updateSettings('videoSettings', 'bitrate', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    label="FPS"
                    type="number"
                    value={localConfig.videoSettings.fps}
                    onChange={(e) =>
                      updateSettings('videoSettings', 'fps', parseInt(e.target.value))
                    }
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    label="幅"
                    type="number"
                    value={localConfig.videoSettings.width}
                    onChange={(e) =>
                      updateSettings('videoSettings', 'width', parseInt(e.target.value))
                    }
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    label="高さ"
                    type="number"
                    value={localConfig.videoSettings.height}
                    onChange={(e) =>
                      updateSettings('videoSettings', 'height', parseInt(e.target.value))
                    }
                  />
                </Grid>
              </Grid>

              {/* オーディオ設定 */}
              <Typography variant="subtitle1" gutterBottom>
                オーディオ設定
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4}>
                  <TextField
                    fullWidth
                    label="ビットレート"
                    value={localConfig.audioSettings.bitrate}
                    onChange={(e) => updateSettings('audioSettings', 'bitrate', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField
                    fullWidth
                    label="サンプルレート"
                    type="number"
                    value={localConfig.audioSettings.sampleRate}
                    onChange={(e) =>
                      updateSettings('audioSettings', 'sampleRate', parseInt(e.target.value))
                    }
                  />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField
                    fullWidth
                    label="チャンネル"
                    type="number"
                    value={localConfig.audioSettings.channels}
                    onChange={(e) =>
                      updateSettings('audioSettings', 'channels', parseInt(e.target.value))
                    }
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleSaveConfig} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 静止画アップロードダイアログ */}
      <Dialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>静止画のアップロード</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              style={{ width: '100%', padding: '10px' }}
            />
            {selectedFile && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                選択ファイル: {selectedFile.name}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleUploadStandbyImage} variant="contained" disabled={!selectedFile}>
            アップロード
          </Button>
        </DialogActions>
      </Dialog>

      {/* アラート */}
      <Snackbar open={alertOpen} autoHideDuration={6000} onClose={() => setAlertOpen(false)}>
        <Alert onClose={() => setAlertOpen(false)} severity={alertSeverity} sx={{ width: '100%' }}>
          {alertMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default NewStreamsPage;
