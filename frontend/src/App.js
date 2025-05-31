import React, { useState, Component } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Container from '@mui/material/Container';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import CloudIcon from '@mui/icons-material/Cloud';
import StreamIcon from '@mui/icons-material/Stream';
import SettingsIcon from '@mui/icons-material/Settings';

// ページのインポート
import HomePage from './pages/HomePage';
import LocalFilesPage from './pages/LocalFilesPage';
import GoogleDrivePage from './pages/GoogleDrivePage';
import StreamsPage from './pages/StreamsPage';
import SettingsPage from './pages/SettingsPage';

// テーマの設定
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
});

// メインナビゲーションコンポーネント
function MainNavigation() {
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  // モバイルメニューの開閉
  const handleMobileMenuOpen = (event) => {
    setMobileMenuAnchor(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchor(null);
  };

  const handleNavigate = (path) => {
    navigate(path);
    handleMobileMenuClose();
  };

  // ナビゲーション項目
  const menuItems = [
    { text: 'ホーム', icon: <HomeIcon />, path: '/', value: 0 },
    { text: 'ローカルファイル', icon: <VideoFileIcon />, path: '/local-files', value: 1 },
    { text: 'Googleドライブ', icon: <CloudIcon />, path: '/google-drive', value: 2 },
    { text: 'ストリーム管理', icon: <StreamIcon />, path: '/streams', value: 3 },
    { text: '設定', icon: <SettingsIcon />, path: '/settings', value: 4 },
  ];

  // 現在のタブ値を取得
  const getCurrentTabValue = () => {
    const currentItem = menuItems.find(item => item.path === location.pathname);
    return currentItem ? currentItem.value : 0;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* トップメニューバー */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
            {/* アプリケーション名 */}
            <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4 }}>
              StreamCaster
            </Typography>

            {/* デスクトップメニュー */}
            {!isMobile ? (
              <Tabs
                value={getCurrentTabValue()}
                onChange={(event, newValue) => {
                  const selectedItem = menuItems.find(item => item.value === newValue);
                  if (selectedItem) {
                    navigate(selectedItem.path);
                  }
                }}
                sx={{
                  flexGrow: 1,
                  '& .MuiTabs-indicator': {
                    backgroundColor: 'white',
                  },
                  '& .MuiTab-root': {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-selected': {
                      color: 'white',
                    },
                  },
                }}
              >
                {menuItems.map((item) => (
                  <Tab
                    key={item.value}
                    icon={item.icon}
                    label={item.text}
                    iconPosition="start"
                    sx={{
                      minHeight: 64,
                      textTransform: 'none',
                      fontSize: '0.875rem',
                    }}
                  />
                ))}
              </Tabs>
            ) : (
              // モバイルメニュー
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <IconButton
                  color="inherit"
                  onClick={handleMobileMenuOpen}
                  aria-label="メニューを開く"
                >
                  <MenuIcon />
                </IconButton>
              </Box>
            )}
          </Toolbar>
        </AppBar>

        {/* モバイル用ドロップダウンメニュー */}
        <Menu
          anchorEl={mobileMenuAnchor}
          open={Boolean(mobileMenuAnchor)}
          onClose={handleMobileMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {menuItems.map((item) => (
            <MenuItem
              key={item.value}
              onClick={() => handleNavigate(item.path)}
              selected={location.pathname === item.path}
              sx={{ minWidth: 200 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                {item.icon}
              </Box>
              {item.text}
            </MenuItem>
          ))}
        </Menu>

        {/* メインコンテンツ */}
        <Box
          component="main"
          sx={{
            backgroundColor: theme => theme.palette.background.default,
            flexGrow: 1,
            pt: 8, // AppBarの高さ分のパディング
          }}
        >
          <Container maxWidth="lg" sx={{ py: 4 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/local-files" element={<LocalFilesPage />} />
              <Route path="/google-drive" element={<GoogleDrivePage />} />
              <Route path="/streams" element={<StreamsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Container>
        </Box>
      </Box>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error && this.state.error.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  console.log('App component rendering...');
  
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MainNavigation />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;