import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  Collapse,
  Typography,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  CloudDownload as DownloadIcon,
  Radio as LiveIcon,
  Error as ErrorIcon,
  CheckCircle as CompletedIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { listActiveStreams } from '../services/streamService';
import { getDownloadStatus } from '../services/googleDriveService';

const StreamStatusIndicator = ({ refreshInterval = 3000 }) => {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // ストリーム状態の取得
  const fetchStreams = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listActiveStreams();
      setStreams(response.data || []);
    } catch (err) {
      console.error('Failed to fetch streams:', err);
      setError('ストリーム情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 定期的な更新
  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // ステータスアイコンの取得
  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <LiveIcon color="error" />;
      case 'preparing':
        return <CircularProgress size={20} />;
      case 'downloading':
        return <DownloadIcon color="info" />;
      case 'completed':
        return <CompletedIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <PlayIcon color="action" />;
    }
  };

  // ステータス色の取得
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'error';
      case 'preparing':
        return 'warning';
      case 'downloading':
        return 'info';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  // ステータステキストの取得
  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return '配信中';
      case 'preparing':
        return '準備中';
      case 'downloading':
        return 'ダウンロード中';
      case 'completed':
        return '完了';
      case 'error':
        return 'エラー';
      default:
        return '不明';
    }
  };

  // アクティブなストリーム数
  const activeCount = streams.filter((s) => s.status === 'active').length;
  const preparingCount = streams.filter((s) => s.status === 'preparing').length;

  if (streams.length === 0 && !loading && !error) {
    return null; // ストリームがない場合は非表示
  }

  return (
    <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, minWidth: 200 }}>
      {/* メインインジケータ */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          bgcolor: 'background.paper',
          borderRadius: 1,
          boxShadow: 2,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {loading ? (
          <CircularProgress size={20} />
        ) : error ? (
          <ErrorIcon color="error" />
        ) : (
          <LiveIcon color={activeCount > 0 ? 'error' : 'action'} />
        )}

        <Typography variant="body2" sx={{ flex: 1 }}>
          {loading
            ? '更新中...'
            : error
              ? 'エラー'
              : activeCount > 0
                ? `配信中 ${activeCount}`
                : preparingCount > 0
                  ? `準備中 ${preparingCount}`
                  : 'ストリーム待機'}
        </Typography>

        <Tooltip title="更新">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              fetchStreams();
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 詳細表示 */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 1, p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {streams.length === 0 && !loading ? (
            <Typography variant="body2" color="text.secondary">
              アクティブなストリームはありません
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {streams.map((stream) => (
                <StreamItem key={stream.id} stream={stream} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// 個別ストリームアイテム
const StreamItem = ({ stream }) => {
  const [downloadStatus, setDownloadStatus] = useState(null);

  // Google Driveファイルのダウンロード状況を取得
  useEffect(() => {
    if (stream.fileId && stream.status === 'preparing') {
      const fetchDownloadStatus = async () => {
        try {
          const response = await getDownloadStatus(stream.fileId);
          setDownloadStatus(response.data);
        } catch (err) {
          console.error('Failed to fetch download status:', err);
        }
      };

      fetchDownloadStatus();
      const interval = setInterval(fetchDownloadStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [stream.fileId, stream.status]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <LiveIcon color="error" />;
      case 'preparing':
        return <CircularProgress size={16} />;
      case 'downloading':
        return <DownloadIcon color="info" />;
      case 'completed':
        return <CompletedIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <PlayIcon color="action" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'error';
      case 'preparing':
        return 'warning';
      case 'downloading':
        return 'info';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return '配信中';
      case 'preparing':
        return '準備中';
      case 'downloading':
        return 'ダウンロード中';
      case 'completed':
        return '完了';
      case 'error':
        return 'エラー';
      default:
        return '不明';
    }
  };

  const fileName = stream.fileName || 'Unknown File';
  const duration = stream.startedAt
    ? Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)
    : 0;

  return (
    <Box sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {getStatusIcon(stream.status)}
        <Chip
          label={getStatusText(stream.status)}
          size="small"
          color={getStatusColor(stream.status)}
        />
        <Typography variant="caption" sx={{ ml: 'auto' }}>
          {duration > 0 &&
            `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`}
        </Typography>
      </Box>

      <Typography variant="body2" noWrap title={fileName}>
        {fileName}
      </Typography>

      {/* ダウンロード進捗表示 */}
      {downloadStatus && downloadStatus.status === 'downloading' && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            ダウンロード中: {downloadStatus.progress || 0}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={downloadStatus.progress || 0}
            sx={{ height: 4, borderRadius: 2 }}
          />
        </Box>
      )}

      {/* エラー詳細 */}
      {stream.status === 'error' && stream.errorMessage && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          {stream.errorMessage}
        </Typography>
      )}
    </Box>
  );
};

export default StreamStatusIndicator;
