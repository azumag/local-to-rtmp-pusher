import axios from 'axios';

// 環境ごとのAPIベースURL
const getBaseUrl = () => {
  // 環境変数から読み取り、デフォルト値を設定
  return process.env.REACT_APP_API_URL || '/api';
};

// axiosのインスタンスを作成
const apiClient = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15秒に増加
});

// Google Drive用の長いタイムアウト設定
export const createGoogleDriveRequest = (config = {}) => {
  return apiClient.request({
    ...config,
    timeout: 30000, // Google Drive操作は30秒のタイムアウト
  });
};

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    // リクエスト前の処理（認証トークンの追加など）
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスインターセプター
apiClient.interceptors.response.use(
  (response) => {
    // レスポンスの処理
    return response;
  },
  (error) => {
    // エラーハンドリング
    if (error.response) {
      // サーバーからのレスポンスがある場合
      console.error('API Error:', error.response.data);
    } else if (error.request) {
      // サーバーからのレスポンスがない場合
      console.error('API No Response:', error.request);
    } else {
      // リクエスト設定時のエラー
      console.error('API Request Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
