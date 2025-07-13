import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { TanstackProvider } from './contexts/providers/Tanstack.jsx';
import { TonProvider } from './contexts/providers/Ton.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TonProvider>
      <TanstackProvider>
        <App />
      </TanstackProvider>
    </TonProvider>
  </StrictMode>,
);
