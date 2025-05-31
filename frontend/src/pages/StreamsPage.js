import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Snackbar,
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  listActiveStreams,
  getStreamInfo,
  getStreamStatus,
  stopStream,
} from '../services/streamService';

function StreamsPage() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStream, setSelectedStream] = useState(null);
  const [streamDetailsOpen, setStreamDetailsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('info');

  // ストリーム一覧を取得
  const fetchStreams = async () => {
    setLoading(true);
    try {
      const response = await listActiveStreams();
      setStreams(response.data);
    } catch (error) {
      console.error('ストリーム一覧の取得に失敗しました', error);
      showAlert('ストリーム一覧の取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 初回ロード時にストリーム一覧を取得
  useEffect(() => {
    fetchStreams();

    // 30秒ごとに更新
    const interval = setInterval(() => {
      fetchStreams();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // ストリームの詳細情報を取得
  const handleViewStreamDetails = async (stream) => {
    try {
      const response = await getStreamStatus(stream.id);
      setSelectedStream(response.data);
      setStreamDetailsOpen(true);
    } catch (error) {
      console.error('ストリーム情報の取得に失敗しました', error);
      showAlert('ストリーム情報の取得に失敗しました', 'error');
    }
  };

  // ストリームを停止
  const handleStopStream = async (streamId) => {
    if (!window.confirm('このストリームを停止してもよろしいですか？')) return;

    try {
      await stopStream(streamId);

      // ストリーム一覧を更新
      fetchStreams();

      showAlert('ストリームを停止しました', 'success');

      // 詳細ダイアログが開いている場合は閉じる
      if (streamDetailsOpen && selectedStream && selectedStream.id === streamId) {
        setStreamDetailsOpen(false);
      }
    } catch (error) {
      console.error('ストリームの停止に失敗しました', error);
      showAlert('ストリームの停止に失敗しました', 'error');
    }
  };

  // アラートを表示
  const showAlert = (message, severity = 'info') => {
    setAlertMessage(message);
    setAlertSeverity(severity);
    setAlertOpen(true);
  };

  // ストリームのステータスに応じた色を取得
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'error':
        return 'error';
      case 'completed':
        return 'info';
      case 'stopped':
        return 'warning';
      default:
        return 'default';
    }
  };

  // ステータスの日本語表示
  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return '配信中';
      case 'error':
        return 'エラー';
      case 'completed':
        return '完了';
      case 'stopped':
        return '停止';
      default:
        return status;
    }
  };

  // 秒数をHH:MM:SS形式に変換
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          ストリーム管理
        </Typography>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchStreams}
          disabled={loading}
        >
          更新
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="body1">
          現在アクティブなストリームの一覧と、その状態を確認できます。ストリームの詳細情報の確認や、ストリームの停止ができます。
        </Typography>
      </Paper>

      {loading ? (
        <LinearProgress sx={{ mb: 2 }} />
      ) : (
        <Grid container spacing={3}>
          {streams.length === 0 ? (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">現在アクティブなストリームはありません。</Typography>
              </Paper>
            </Grid>
          ) : (
            streams.map((stream) => (
              <Grid item xs={12} md={6} lg={4} key={stream.id}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                      }}
                    >
                      <Typography variant="h6" component="div" noWrap title={stream.fileName}>
                        {stream.fileName}
                      </Typography>
                      <Chip
                        label={getStatusText(stream.status)}
                        color={getStatusColor(stream.status)}
                        size="small"
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary">
                      出力: {stream.rtmpUrl}/{stream.streamKey}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      開始: {new Date(stream.startedAt).toLocaleString()}
                    </Typography>

                    {stream.duration && (
                      <Typography variant="body2" color="text.secondary">
                        配信時間: {formatDuration(stream.duration)}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<InfoIcon />}
                      onClick={() => handleViewStreamDetails(stream)}
                    >
                      詳細
                    </Button>
                    {stream.status === 'active' && (
                      <IconButton
                        color="error"
                        size="small"
                        onClick={() => handleStopStream(stream.id)}
                      >
                        <StopIcon />
                      </IconButton>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {/* ストリーム詳細ダイアログ */}
      <Dialog
        open={streamDetailsOpen}
        onClose={() => setStreamDetailsOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>ストリーム詳細</DialogTitle>
        <DialogContent>
          {selectedStream && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {selectedStream.fileName}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">ステータス</Typography>
                  <Chip
                    label={getStatusText(selectedStream.status)}
                    color={getStatusColor(selectedStream.status)}
                    size="small"
                  />
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="subtitle2">配信時間</Typography>
                  <Typography variant="body2">
                    {selectedStream.duration ? formatDuration(selectedStream.duration) : 'N/A'}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2">出力URL</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {selectedStream.outputUrl ||
                      `${selectedStream.rtmpUrl}/${selectedStream.streamKey}`}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="subtitle2">開始時間</Typography>
                  <Typography variant="body2">
                    {selectedStream.startedAt
                      ? new Date(selectedStream.startedAt).toLocaleString()
                      : 'N/A'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="subtitle2">終了時間</Typography>
                  <Typography variant="body2">
                    {selectedStream.endedAt
                      ? new Date(selectedStream.endedAt).toLocaleString()
                      : '進行中'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="subtitle2">形式</Typography>
                  <Typography variant="body2" sx={{ textTransform: 'uppercase' }}>
                    {selectedStream.format || 'RTMP'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="subtitle2">ファイルID</Typography>
                  <Typography variant="body2" noWrap title={selectedStream.fileId}>
                    {selectedStream.fileId}
                  </Typography>
                </Grid>

                {selectedStream.videoSettings && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">動画設定</Typography>
                    <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
                      <Grid container spacing={1}>
                        <Grid item xs={6}>
                          <Typography variant="caption">コーデック:</Typography>
                          <Typography variant="body2">
                            {selectedStream.videoSettings.codec}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">ビットレート:</Typography>
                          <Typography variant="body2">
                            {selectedStream.videoSettings.bitrate}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">フレームレート:</Typography>
                          <Typography variant="body2">
                            {selectedStream.videoSettings.framerate} fps
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">解像度:</Typography>
                          <Typography variant="body2">
                            {selectedStream.videoSettings.width}x
                            {selectedStream.videoSettings.height}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  </Grid>
                )}

                {selectedStream.audioSettings && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">音声設定</Typography>
                    <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
                      <Grid container spacing={1}>
                        <Grid item xs={6}>
                          <Typography variant="caption">コーデック:</Typography>
                          <Typography variant="body2">
                            {selectedStream.audioSettings.codec}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">ビットレート:</Typography>
                          <Typography variant="body2">
                            {selectedStream.audioSettings.bitrate}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">サンプルレート:</Typography>
                          <Typography variant="body2">
                            {selectedStream.audioSettings.sampleRate} Hz
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption">チャンネル:</Typography>
                          <Typography variant="body2">
                            {selectedStream.audioSettings.channels}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  </Grid>
                )}

                {selectedStream.errorMessage && (
                  <Grid item xs={12}>
                    <Alert severity="error">{selectedStream.errorMessage}</Alert>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStreamDetailsOpen(false)}>閉じる</Button>
          {selectedStream && selectedStream.status === 'active' && (
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              onClick={() => {
                handleStopStream(selectedStream.id);
                setStreamDetailsOpen(false);
              }}
            >
              ストリームを停止
            </Button>
          )}
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

export default StreamsPage;
