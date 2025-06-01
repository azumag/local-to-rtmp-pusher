import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { styled } from '@mui/material/styles';

// APIサービスのインポート
import { uploadFile, listFiles, deleteFile } from '../services/fileService';
import { usePersistentStreaming } from '../hooks/usePersistentStreaming';
import FileCard from '../components/FileCard';

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

  // 永続ストリーミング機能
  const {
    currentSession,
    sessionStatus,
    canSwitchContent,
    switchToFile,
  } = usePersistentStreaming();

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
      alert(
        `エラー: ${error.response?.data?.error || error.message || 'ファイルのアップロードに失敗しました'}`
      );
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

  // 永続ストリーミングセッションにファイルを送信
  const handleSendToStream = async (file) => {
    if (!currentSession) {
      alert('アクティブなストリーミングセッションがありません');
      return;
    }

    try {
      await switchToFile(currentSession.id, file.id, false);
      alert(`ファイルを配信に送信しました: ${file.originalName}`);
    } catch (error) {
      console.error('ファイル送信に失敗しました', error);
      alert(`エラー: ${error.message || 'ファイル送信に失敗しました'}`);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        ローカルファイル
      </Typography>

      <Paper
        sx={{ p: 3, mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="body1">
            動画ファイルをアップロードしてRTMP/SRTで配信することができます。
          </Typography>
          
          {/* セッション状態の詳細表示 */}
          {currentSession && (
            <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #ddd' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                セッション: {currentSession.id.slice(-8)} | 
                状態: {sessionStatus?.status || 'unknown'} | 
                送信可能: {canSwitchContent ? 'はい' : 'いいえ'} |
                アクティブ: {sessionStatus?.isActive ? 'はい' : 'いいえ'}
              </Typography>
              
              {!canSwitchContent && sessionStatus && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                  {sessionStatus.status === 'connecting' && '⏳ RTMPストリーム接続中です... しばらくお待ちください'}
                  {sessionStatus.status === 'error' && `❌ セッションエラー: ${sessionStatus.errorMessage || 'FFmpegの起動に失敗しました'}`}
                  {sessionStatus.status === 'reconnecting' && '🔄 再接続中です...'}
                  {sessionStatus.status === 'disconnected' && '⚠️ セッションが切断されています'}
                  {!['connecting', 'error', 'reconnecting', 'disconnected'].includes(sessionStatus.status) && 
                    `❓ 予期しない状態: ${sessionStatus.status}`}
                </Typography>
              )}
              
              {canSwitchContent && (
                <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                  ✅ ファイルを配信に送ることができます
                </Typography>
              )}
            </Box>
          )}
        </Box>

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
                    uploadDate: file.createdAt,
                  }}
                  onSendToStream={() => handleSendToStream(file)}
                  onDelete={() => handleDeleteFile(file.id)}
                  cardType="local"
                  showDelete={true}
                  showSendToStream={true}
                  canSendToStream={canSwitchContent}
                />
              </Grid>
            ))
          ) : (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">まだファイルがアップロードされていません。</Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}

export default LocalFilesPage;
