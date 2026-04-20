import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatWidget } from './ChatWidget';

declare global {
  interface Window {
    SUM_CHATBOT_CONFIG?: {
      apiUrl?: string;
      theme?: 'light' | 'dark';
    };
  }
}

function mount() {
  const config = window.SUM_CHATBOT_CONFIG ?? {};
  const container = document.createElement('div');
  container.id = 'sum-chatbot-root';
  document.body.appendChild(container);
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ChatWidget
        apiUrl={config.apiUrl ?? 'http://localhost:3100'}
        theme={config.theme ?? 'light'}
      />
    </React.StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
