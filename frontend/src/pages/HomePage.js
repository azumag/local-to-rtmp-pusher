import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardContent, CardActions, Button, Grid, Paper } from '@mui/material';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import CloudIcon from '@mui/icons-material/Cloud';
import StreamIcon from '@mui/icons-material/Stream';
import SettingsIcon from '@mui/icons-material/Settings';

function HomePage() {
  const navigate = useNavigate();

  const menuItems = [
    {
      title: 'ローカルファイル',
      description: 'ローカルに保存された動画ファイルをアップロードしてRTMP/SRTでストリーミングします。',
      icon: <VideoFileIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
      path: '/local-files',
    },
    {
      title: 'Googleドライブ',
      description: 'Googleドライブの共有フォルダから動画ファイルを選択してストリーミングします。',
      icon: <CloudIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
      path: '/google-drive',
    },
    {
      title: 'ストリーム管理',
      description: '現在のストリームを管理して、進行状況やステータスを確認します。',
      icon: <StreamIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
      path: '/streams',
    },
    {
      title: '設定',
      description: 'RTMPサーバーの設定やストリーミングのデフォルト設定を構成します。',
      icon: <SettingsIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
      path: '/settings',
    },
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Local to RTMP Pusher
        </Typography>
        <Typography variant="body1" paragraph>
          ローカルまたはGoogleドライブの動画ファイルをRTMP/SRTでストリーミング配信するシステムへようこそ。
          このアプリケーションを使用すると、FFmpegを使用して動画ファイルをRTMPサーバーにプッシュできます。
        </Typography>
      </Paper>

      <Grid container spacing={3}>
        {menuItems.map((item) => (
          <Grid item xs={12} md={6} key={item.title}>
            <Card 
              sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-5px)',
                  boxShadow: 6,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <Box sx={{ p: 2 }}>
                  {item.icon}
                </Box>
                <Typography gutterBottom variant="h5" component="h2">
                  {item.title}
                </Typography>
                <Typography>
                  {item.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button 
                  size="large" 
                  fullWidth 
                  variant="contained"
                  onClick={() => navigate(item.path)}
                >
                  {item.title}を開く
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default HomePage;