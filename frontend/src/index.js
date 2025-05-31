import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
// import App from './TestApp';
import { BrowserRouter } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';

if (process.env.NODE_ENV === 'development') {
  console.log('index.js loaded');
}

const rootElement = document.getElementById('root');
if (process.env.NODE_ENV === 'development') {
  console.log('Root element:', rootElement);
}

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  if (process.env.NODE_ENV === 'development') {
    console.log('Creating React root...');
  }
  
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
  
  console.log('React app rendered');
} else {
  console.error('Root element not found!');
}

// パフォーマンス計測（必要に応じて）
reportWebVitals();