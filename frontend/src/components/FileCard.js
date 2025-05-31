import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Tooltip,
  CardMedia,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  CloudDownload as DownloadIcon,
  Videocam as VideocamIcon,
  Folder as FolderIcon,
  FlashOn as FlashOnIcon,
  SendToMobile as SendToStreamIcon,
} from '@mui/icons-material';

const FileCard = ({
  file,
  onStream,
  onQuickStream,
  onDelete,
  onDownload,
  onSendToStream,
  isStreaming = false,
  showDownload = false,
  showDelete = true,
  showQuickStream = false,
  showSendToStream = false,
  canSendToStream = false,
  cardType = 'local', // 'local' or 'gdrive'
  apiBaseUrl = process.env.REACT_APP_API_URL || '/api',
}) => {
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getFileIcon = () => {
    if (file.mimeType?.includes('folder')) {
      return <FolderIcon />;
    }
    return <VideocamIcon />;
  };

  const isFolder = file.mimeType?.includes('folder');
  const thumbnailUrl =
    cardType === 'local' && file.id && !isFolder
      ? `${apiBaseUrl}/files/${file.id}/thumbnail`
      : null;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* サムネイル表示 */}
      {thumbnailUrl ? (
        <CardMedia
          component="img"
          height="140"
          image={thumbnailUrl}
          alt={file.name}
          sx={{
            objectFit: 'cover',
            backgroundColor: '#f5f5f5',
          }}
          onError={(e) => {
            // サムネイル読み込みエラー時はアイコン表示にフォールバック
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      ) : null}

      {/* フォールバック用のアイコン表示 */}
      {!thumbnailUrl && (
        <Box
          sx={{
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f5',
            color: '#666',
          }}
        >
          {getFileIcon()}
        </Box>
      )}

      {/* サムネイル読み込み失敗時のフォールバック */}
      <Box
        sx={{
          height: 140,
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          color: '#666',
        }}
      >
        {getFileIcon()}
      </Box>

      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="h6" component="div" sx={{ mb: 1 }} noWrap>
          {file.name || file.originalName}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {file.size && (
            <Typography variant="body2" color="text.secondary">
              Size: {formatFileSize(file.size)}
            </Typography>
          )}

          {file.uploadDate && (
            <Typography variant="body2" color="text.secondary">
              Uploaded: {formatDate(file.uploadDate)}
            </Typography>
          )}

          {file.modifiedTime && (
            <Typography variant="body2" color="text.secondary">
              Modified: {formatDate(file.modifiedTime)}
            </Typography>
          )}

          {cardType === 'gdrive' && file.id && (
            <Typography variant="caption" color="text.secondary" noWrap>
              ID: {file.id}
            </Typography>
          )}

          {isStreaming && (
            <Chip label="Currently Streaming" color="success" size="small" sx={{ mt: 1 }} />
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {!isFolder && (
            <>
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayIcon />}
                onClick={() => onStream(file)}
                disabled={isStreaming}
              >
                ストリーム
              </Button>

              {showQuickStream && onQuickStream && (
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<FlashOnIcon />}
                  onClick={() => onQuickStream(file)}
                  disabled={isStreaming}
                  sx={{ minWidth: 'auto' }}
                >
                  クイック
                </Button>
              )}

              {showSendToStream && onSendToStream && (
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<SendToStreamIcon />}
                  onClick={() => onSendToStream(file)}
                  disabled={!canSendToStream || isStreaming}
                  title={!canSendToStream ? 'アクティブなセッションがありません' : ''}
                >
                  配信に送る
                </Button>
              )}
            </>
          )}

          {showDownload && !isFolder && (
            <Tooltip title="ダウンロード">
              <IconButton size="small" onClick={() => onDownload(file)}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {showDelete && onDelete && (
          <Tooltip title="削除">
            <IconButton
              size="small"
              color="error"
              onClick={() => onDelete(file)}
              disabled={isStreaming}
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        )}
      </CardActions>
    </Card>
  );
};

export default FileCard;
