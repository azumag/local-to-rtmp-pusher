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
  Tooltip
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  CloudDownload as DownloadIcon,
  Videocam as VideocamIcon,
  Folder as FolderIcon
} from '@mui/icons-material';

const FileCard = ({
  file,
  onStream,
  onDelete,
  onDownload,
  isStreaming = false,
  showDownload = false,
  showDelete = true,
  cardType = 'local' // 'local' or 'gdrive'
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

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getFileIcon()}
          <Typography variant="h6" component="div" sx={{ ml: 1 }} noWrap>
            {file.name}
          </Typography>
        </Box>
        
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
            <Chip 
              label="Currently Streaming" 
              color="success" 
              size="small" 
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      </CardContent>
      
      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          {!isFolder && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={() => onStream(file)}
              disabled={isStreaming}
            >
              Stream
            </Button>
          )}
          
          {showDownload && !isFolder && (
            <Tooltip title="Download file">
              <IconButton
                size="small"
                onClick={() => onDownload(file)}
                sx={{ ml: 1 }}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {showDelete && onDelete && (
          <Tooltip title="Delete file">
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