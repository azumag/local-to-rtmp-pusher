import axios from 'axios';

// 環境ごとのAPIベースURL
const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000/api';
  }
  return '/api'; // 本番環境ではプロキシを使用
};

// axiosのインスタンスを作成
const apiClient = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 120秒（2分）に延長
});

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